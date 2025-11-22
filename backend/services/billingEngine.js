const { transaction } = require('../config/database');
const walletService = require('./walletService');

// Note: Timer storage removed since frontend is now authoritative for timer management

/**
 * Validates that a session is in a state where billing can occur.
 * @param {object} session - The session object from the database.
 */
function _validateSessionForBilling(session) {
    if (!session) {
        throw new Error('Session not found.');
    }
    if (['completed', 'cancelled', 'finalized', 'error'].includes(session.status)) {
        throw new Error(`Session has already been finalized with status: ${session.status}.`);
    }
}

/**
 * Calculates the final bill, applying the 15-minute minimum charge rule only if there is billed time.
 * @param {number} totalBilledMinutes - The total minutes where both users were present.
 * @param {number} perMinuteRate - The mentor's rate per minute.
 * @param {number} minimumCharge - The minimum charge for the session.
 * @returns {number} The calculated final bill.
 */
function _calculateFinalBill(totalBilledMinutes, perMinuteRate, minimumCharge) {
    if (totalBilledMinutes <= 0) {
        return 0;  // No charge if no time was billed
    }
    const calculatedCharge = totalBilledMinutes * perMinuteRate;
    // The final bill is the greater of the minimum charge or the actual calculated charge.
    return Math.max(minimumCharge, calculatedCharge);
}

/**
 * Core function to finalize a session. Calculates charges, performs all financial transactions atomically,
 * and updates session records. This function is intended for internal use by the billing engine.
 * @private
 * @param {number} sessionId - The ID of the session to finalize.
 * @param {string} endReason - The reason for the session ending (e.g., 'mentor_ended', 'timer_expired', 'balance_depleted').
 * @returns {Promise<object>} The result of the finalization.
 */
async function _finalizeSession(sessionId, endReason) {
    console.log(`[BillingEngine] ==> _finalizeSession: START for session ${sessionId}`);
    console.log(`[BillingEngine] End reason: ${endReason}`);

    // Ensure sessionId is a number
    sessionId = parseInt(sessionId, 10);
    if (isNaN(sessionId)) {
        throw new Error('Invalid session ID: must be a valid number');
    }
    console.log(`[BillingEngine] Parsed sessionId: ${sessionId} (type: ${typeof sessionId})`);

    return await transaction(async (client) => {
        // 1. Fetch the latest session data within the transaction for consistency.
        console.log(`[BillingEngine] Step 1: Fetching session data for ID ${sessionId}`);
        const sessionRes = await client.query(
            `SELECT s.*, m.user_id as mentor_user_id
             FROM sessions s
             JOIN mentors m ON s.mentor_id = m.id
             WHERE s.id = $1 FOR UPDATE`,
            [sessionId]
        );
        const session = sessionRes.rows[0];
        console.log(`[BillingEngine] Session data retrieved:`, {
            id: session.id,
            status: session.status,
            billing_status: session.billing_status,
            billed_minutes: session.billed_minutes,
            actual_billed_amount: session.actual_billed_amount,
            mentor_id: session.mentor_id,
            mentor_user_id: session.mentor_user_id,
            mentee_id: session.mentee_id
        });

        _validateSessionForBilling(session);
        console.log(`[BillingEngine] Session validation passed`);

        let totalBilledMinutes = parseFloat(session.billed_minutes) || 0;
        console.log(`[BillingEngine] Step 2: Initial billed minutes: ${totalBilledMinutes}`);

        // 2. Calculate final block if active
        if (session.billing_status === 'active' && session.billing_start_time) {
            console.log(`[BillingEngine] Billing was active, calculating final elapsed time`);
            const now = new Date();
            const startTime = new Date(session.billing_start_time);

            // FIX: Use .getTime() for absolute MS difference
            const elapsedMs = now.getTime() - startTime.getTime();
            const finalElapsedMinutes = elapsedMs / (1000 * 60);

            console.log('[BillingEngine] Finalize Calc:', {
                start: startTime.toISOString(),
                end: now.toISOString(),
                elapsedMs,
                finalElapsedMinutes
            });

            // Sanity check: prevent negative minutes if clocks drift slightly
            if (finalElapsedMinutes > 0) {
                totalBilledMinutes += finalElapsedMinutes;
                console.log(`[BillingEngine] Added ${finalElapsedMinutes} minutes, total now: ${totalBilledMinutes}`);
            } else {
                console.log(`[BillingEngine] No minutes added (elapsed was ${finalElapsedMinutes})`);
            }
        } else {
            console.log(`[BillingEngine] Billing not active or no start time. Status: ${session.billing_status}, Start time: ${session.billing_start_time}`);
        }

        // 3. Cap billed minutes at 60 minutes maximum
        console.log(`[BillingEngine] Step 3: Applying 60-minute cap`);
        totalBilledMinutes = Math.min(totalBilledMinutes, 60);
        console.log(`[BillingEngine] Billed minutes after cap: ${totalBilledMinutes}`);

        // 4. Determine the final bill using the 15-minute minimum rule.
        console.log(`[BillingEngine] Step 4: Calculating final bill`);
        console.log(`[BillingEngine] Inputs: totalBilledMinutes=${totalBilledMinutes}, perMinuteRate=${session.per_minute_rate}, minimumCharge=${session.minimum_charge}`);

        const finalBill = _calculateFinalBill(
            totalBilledMinutes,
            parseFloat(session.per_minute_rate),
            parseFloat(session.minimum_charge)
        );

        console.log(`[BillingEngine] Final bill calculated: ${finalBill}`);

        // 5. Calculate platform fee and mentor payout.
        console.log(`[BillingEngine] Step 5: Calculating fees and payouts`);
        const platformFeeRate = parseFloat(process.env.PLATFORM_FEE_RATE || '0.10'); // 10% default
        const platformFee = finalBill * platformFeeRate;
        const mentorPayout = finalBill - platformFee;

        console.log(`[BillingEngine] Financial breakdown:`, {
            finalBill,
            platformFeeRate,
            platformFee,
            mentorPayout
        });

        // 6. Ensure wallets exist before transactions.
        console.log(`[BillingEngine] Step 6: Ensuring wallets exist`);
        console.log(`[BillingEngine] Checking mentee wallet: userId=${session.mentee_id}`);
        const menteeWalletResult = await walletService.initializeWallet(session.mentee_id, client);
        console.log(`[BillingEngine] Mentee wallet: ${menteeWalletResult.message || 'created'}`);

        console.log(`[BillingEngine] Checking mentor wallet: userId=${session.mentor_user_id}`);
        const mentorWalletResult = await walletService.initializeWallet(session.mentor_user_id, client);
        console.log(`[BillingEngine] Mentor wallet: ${mentorWalletResult.message || 'created'}`);

        console.log(`[BillingEngine] Wallets verified/created successfully`);

        // 7. Perform financial transactions.
        console.log(`[BillingEngine] Step 7: Performing financial transactions`);
        if (finalBill > 0) {
            console.log(`[BillingEngine] Processing payment for mentee ${session.mentee_id} and mentor ${session.mentor_id}`);

            // Debit the mentee for the final amount.
            console.log(`[BillingEngine] Debiting mentee wallet: userId=${session.mentee_id}, amount=${finalBill}, sessionId=${sessionId}`);
            const debitResult = await walletService.debitWallet(
                session.mentee_id,
                finalBill,
                sessionId,
                `Session completion charge for session #${sessionId}.`,
                client // Pass the transactional client
            );
            console.log(`[BillingEngine] Mentee wallet debited successfully: new balance=${debitResult.balance}`);

            // Credit the mentor's wallet.
            console.log(`[BillingEngine] Crediting mentor wallet: userId=${session.mentor_user_id}, amount=${mentorPayout}, sessionId=${sessionId}`);
            const creditResult = await walletService.creditWallet(
                session.mentor_user_id, // Mentor's wallet is tied to their user ID
                mentorPayout,
                sessionId,
                `Payout for session #${sessionId}.`,
                client // Pass the transactional client
            );
            console.log(`[BillingEngine] Mentor wallet credited successfully: new balance=${creditResult.balance}`);

            // Record the earning for the mentor.
            console.log(`[BillingEngine] Recording mentor earnings: mentorId=${session.mentor_id}, sessionId=${sessionId}, amount=${mentorPayout}`);
            await client.query(
                `INSERT INTO mentor_earnings (mentor_id, session_id, amount, status)
                 VALUES ($1, $2, $3, 'completed')`,
                [session.mentor_id, sessionId, mentorPayout]
            );
            console.log(`[BillingEngine] Mentor earnings recorded successfully`);
        } else {
            console.log(`[BillingEngine] No financial transactions needed (final bill is 0)`);
        }

        // 8. Update Session
        console.log(`[BillingEngine] Step 8: Updating session record`);
        // FIX: Use Node generated date for actual_end_time
        const actualEndTime = new Date();
        console.log(`[BillingEngine] Actual end time: ${actualEndTime.toISOString()}`);

        // Clear presence columns after meeting ends
        console.log(`[BillingEngine] Clearing presence columns for session ${sessionId}`);

        // safe calculation for total duration
        const actualStart = session.actual_start_time ? new Date(session.actual_start_time) : actualEndTime;
        const totalDuration = (actualEndTime.getTime() - actualStart.getTime()) / (1000 * 60);
        const roundedDuration = Math.ceil(totalDuration); // Round up to nearest integer
        console.log(`[BillingEngine] Total duration calculated: ${totalDuration} minutes, rounded up to: ${roundedDuration} minutes`);

        console.log(`[BillingEngine] Updating session with:`, {
            status: 'completed',
            billing_status: 'finalized',
            actual_end_time: actualEndTime,
            actual_duration_minutes: roundedDuration,
            billed_minutes: totalBilledMinutes,
            actual_billed_amount: finalBill,
            platform_fee: platformFee,
            mentor_payout_amount: mentorPayout,
            admin_notes: `Ended: ${endReason}`
        });

        await client.query(
            `UPDATE sessions SET
                status = 'completed',
                billing_status = 'finalized',
                actual_end_time = $1,
                actual_duration_minutes = $2,
                billed_minutes = $3,
                actual_billed_amount = $4,
                platform_fee = $5,
                mentor_payout_amount = $6,
                mentee_present = false,
                mentor_present = false,
                admin_notes = COALESCE(admin_notes, '') || E'\nEnded: ${endReason}'
            WHERE id = $7`,
            [actualEndTime, roundedDuration, totalBilledMinutes, finalBill, platformFee, mentorPayout, sessionId]
        );

        console.log(`[BillingEngine] Session ${sessionId} finalized successfully. Final Bill: ${finalBill}`);

        // 9. Note: Timer cleanup not needed since frontend is now authoritative
        console.log(`[BillingEngine] Step 9: Timer cleanup skipped (frontend authoritative)`);

        return { success: true, finalBill, mentorPayout, platformFee, billedMinutes: totalBilledMinutes };
    });
}

/**
 * Handles a user joining a session. Updates presence and starts billing if both parties are present.
 * @param {number} sessionId - The session ID.
 * @param {string} userType - 'mentee' or 'mentor'.
 * @returns {Promise<{success: boolean, billingStatus: string}>}
 */
async function handleUserJoin(sessionId, userType) {
    console.log(`[BillingEngine] Handling JOIN for ${userType} in session ${sessionId}`);

    return await transaction(async (client) => {
        // Get the current session state.
        const sessionRes = await client.query('SELECT * FROM sessions WHERE id = $1 FOR UPDATE', [sessionId]);
        const session = sessionRes.rows[0];
        _validateSessionForBilling(session);

        const presenceColumn = userType === 'mentee' ? 'mentee_present' : 'mentor_present';
        const otherPresenceColumn = userType === 'mentee' ? 'mentor_present' : 'mentee_present';

        // Update the presence of the joining user.
        await client.query(`UPDATE sessions SET ${presenceColumn} = true WHERE id = $1`, [sessionId]);

        let billingStatus = session.billing_status;

        // The user who just joined is now present, get the status of the *other* user.
        const otherUserIsPresent = session[otherPresenceColumn];

        // FIX: Generate the date in Node.js to ensure consistency with handleUserLeave
        const now = new Date();

        // If the other user is already here (making both present now) and billing isn't active, start it.
        if (otherUserIsPresent && billingStatus !== 'active') {
             console.log(`[BillingEngine] Starting billing. Time ref: ${now.toISOString()}`);
             
             // CHANGED: Passed 'now' as parameter $2 instead of using SQL 'CURRENT_TIMESTAMP'
             await client.query(
                "UPDATE sessions SET billing_status = 'active', billing_start_time = $2 WHERE id = $1",
                [sessionId, now]
            );
            billingStatus = 'active';
        }

        return { success: true, billingStatus };
    });
}


/**
 * Handles a user leaving a session. Pauses billing if it was active.
 * @param {number} sessionId - The session ID.
 * @param {string} userType - 'mentee' or 'mentor'.
 * @returns {Promise<{success: boolean, billingStatus: string}>}
 */
async function handleUserLeave(sessionId, userType) {
    console.log(`[BillingEngine] Handling LEAVE for ${userType} in session ${sessionId}`);

    return await transaction(async (client) => {
        // Get current session state.
        const sessionRes = await client.query('SELECT * FROM sessions WHERE id = $1 FOR UPDATE', [sessionId]);
        const session = sessionRes.rows[0];
        _validateSessionForBilling(session);

        // Update presence.
        const presenceColumn = userType === 'mentee' ? 'mentee_present' : 'mentor_present';
        await client.query(`UPDATE sessions SET ${presenceColumn} = false WHERE id = $1`, [sessionId]);

        let billingStatus = session.billing_status;

        // If billing was active, pause it and update the total billed minutes.
        if (billingStatus === 'active') {
            const elapsedMs = new Date() - new Date(session.billing_start_time);
            const newBilledMinutes = (parseFloat(session.billed_minutes) || 0) + (elapsedMs / (1000 * 60));

            await client.query(
                `UPDATE sessions SET
                    billed_minutes = $1,
                    billing_status = 'paused',
                    billing_start_time = NULL
                WHERE id = $2`,
                [newBilledMinutes, sessionId]
            );
            billingStatus = 'paused';
            console.log(`[BillingEngine] Billing paused for session ${sessionId}. Total billed minutes: ${newBilledMinutes}`);
        }

        return { success: true, billingStatus };
    });
}

/**
 * Initiates the session timers: a hard 60-minute limit and a "kill switch" based on mentee balance.
 * This should be called once when the session officially starts (e.g., first user joins).
 * @param {number} sessionId - The session ID.
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function initiateSessionTimers(sessionId) {
    console.log(`[BillingEngine] Initiating timers for session ${sessionId}`);
    
    // Note: Timer clearing not needed since frontend is now authoritative
    
    return await transaction(async (client) => {
        const sessionRes = await client.query('SELECT mentee_id, per_minute_rate FROM sessions WHERE id = $1', [sessionId]);
        const session = sessionRes.rows[0];

        if (!session) throw new Error('Cannot initiate timers: session not found.');

        // 1. Calculate max duration based on mentee's balance.
        const { balance } = await walletService.getWalletBalance(session.mentee_id, client);
        const perMinuteRate = parseFloat(session.per_minute_rate);
        let balanceBasedMinutes = Infinity;
        
        if (perMinuteRate > 0) {
            balanceBasedMinutes = balance / perMinuteRate;
        }

        // 2. The session ends at the hard 60-minute limit OR when the balance runs out, whichever is first.
        const maxSessionMinutes = 60;
        const endInMinutes = Math.min(maxSessionMinutes, balanceBasedMinutes);
        
        let endReason = endInMinutes === balanceBasedMinutes ? 'balance_depleted' : 'timer_expired';

        console.log(`[BillingEngine] Session ${sessionId} can run for a maximum of ${endInMinutes.toFixed(2)} minutes.`);

        // 3. Note: Timer is now handled by frontend. Backend timer removed to make frontend authoritative.
        console.log(`[BillingEngine] Session ${sessionId} timer will be managed by frontend (authoritative)`);
        
        // 4. Set a 5-minute warning timer if the session will end due to balance depletion.
        if (endReason === 'balance_depleted' && endInMinutes > 5) {
             setTimeout(() => {
                console.log(`[BillingEngine] Emitting 5-minute low balance warning for session ${sessionId}.`);
                // TODO: Integrate WebSocket to send 'low_balance_warning' to the frontend.
             }, (endInMinutes - 5) * 60 * 1000);
        }

        return { success: true, message: `Session initialized with ${endInMinutes.toFixed(2)} minute limit (frontend managed).` };
    });
}

/**
 * Public-facing function to gracefully end a session.
 * Can be called from a controller when the mentor ends the meeting.
 * @param {number} sessionId - The session ID.
 * @param {string} reason - A descriptive reason for why the session is being ended.
 * @returns {Promise<object>}
 */
async function endSession(sessionId, reason = "user_initiated") {
    console.log(`[BillingEngine] Received request to end session ${sessionId}. Reason: ${reason}`);
    // This is a wrapper to call the internal finalization logic.
    return await _finalizeSession(sessionId, reason);
}


module.exports = {
    handleUserJoin,
    handleUserLeave,
    initiateSessionTimers,
    endSession,
};