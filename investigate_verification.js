const { query } = require('./backend/config/database');

async function investigateUserVerification(userId, uuid) {
    console.log(`🔍 Investigating verification status for User ID: ${userId}, UUID: ${uuid}\n`);

    try {
        // 1. Query users table for verification-related columns
        console.log('1. Checking users table for verification details...');
        const userQuery = `
            SELECT
                id, uuid, email, first_name, last_name, phone,
                is_verified, is_active,
                email_verified_at, phone_verified_at,
                created_at, updated_at, last_login_at, login_count
            FROM users
            WHERE id = $1 OR uuid = $2
        `;
        const userResult = await query(userQuery, [userId, uuid]);

        if (userResult.rows.length === 0) {
            console.log('❌ User not found in database');
            return;
        }

        const user = userResult.rows[0];
        console.log('User Details:');
        console.log(`   - ID: ${user.id}`);
        console.log(`   - UUID: ${user.uuid}`);
        console.log(`   - Email: ${user.email}`);
        console.log(`   - Name: ${user.first_name} ${user.last_name}`);
        console.log(`   - Phone: ${user.phone || 'Not provided'}`);
        console.log(`   - is_verified: ${user.is_verified}`);
        console.log(`   - is_active: ${user.is_active}`);
        console.log(`   - email_verified_at: ${user.email_verified_at || 'NULL'}`);
        console.log(`   - phone_verified_at: ${user.phone_verified_at || 'NULL'}`);
        console.log(`   - created_at: ${user.created_at}`);
        console.log(`   - updated_at: ${user.updated_at}`);
        console.log(`   - last_login_at: ${user.last_login_at || 'Never logged in'}`);
        console.log(`   - login_count: ${user.login_count}\n`);

        // 2. Check email verification tokens
        console.log('2. Checking email verification tokens...');
        const emailTokensQuery = `
            SELECT
                id, token_hash, expires_at, used_at, created_at
            FROM email_verification_tokens
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 10
        `;
        const emailTokensResult = await query(emailTokensQuery, [user.id]);

        console.log(`Found ${emailTokensResult.rows.length} email verification tokens:`);
        if (emailTokensResult.rows.length === 0) {
            console.log('   - No email verification tokens found\n');
        } else {
            emailTokensResult.rows.forEach((token, index) => {
                console.log(`   Token ${index + 1}:`);
                console.log(`     - ID: ${token.id}`);
                console.log(`     - Expires: ${token.expires_at}`);
                console.log(`     - Used: ${token.used_at || 'Not used'}`);
                console.log(`     - Created: ${token.created_at}`);
            });
            console.log('');
        }

        // 3. Check password reset tokens (might indicate account activity)
        console.log('3. Checking password reset tokens...');
        const resetTokensQuery = `
            SELECT
                id, expires_at, used_at, created_at
            FROM password_reset_tokens
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 5
        `;
        const resetTokensResult = await query(resetTokensQuery, [user.id]);

        console.log(`Found ${resetTokensResult.rows.length} password reset tokens:`);
        if (resetTokensResult.rows.length === 0) {
            console.log('   - No password reset tokens found\n');
        } else {
            resetTokensResult.rows.forEach((token, index) => {
                console.log(`   Token ${index + 1}:`);
                console.log(`     - ID: ${token.id}`);
                console.log(`     - Expires: ${token.expires_at}`);
                console.log(`     - Used: ${token.used_at || 'Not used'}`);
                console.log(`     - Created: ${token.created_at}`);
            });
            console.log('');
        }

        // 4. Check for any notifications related to verification
        console.log('4. Checking verification-related notifications...');
        const notificationsQuery = `
            SELECT
                id, title, message, type, is_read, is_sent,
                sent_at, created_at, metadata
            FROM notifications
            WHERE user_id = $1
            AND type IN ('profile_verified', 'booking_request', 'system_announcement')
            ORDER BY created_at DESC
            LIMIT 10
        `;
        const notificationsResult = await query(notificationsQuery, [user.id]);

        console.log(`Found ${notificationsResult.rows.length} relevant notifications:`);
        if (notificationsResult.rows.length === 0) {
            console.log('   - No verification-related notifications found\n');
        } else {
            notificationsResult.rows.forEach((notif, index) => {
                console.log(`   Notification ${index + 1}:`);
                console.log(`     - Type: ${notif.type}`);
                console.log(`     - Title: ${notif.title}`);
                console.log(`     - Sent: ${notif.is_sent}`);
                console.log(`     - Read: ${notif.is_read}`);
                console.log(`     - Created: ${notif.created_at}`);
                if (notif.metadata) {
                    console.log(`     - Metadata: ${JSON.stringify(notif.metadata)}`);
                }
            });
            console.log('');
        }

        // 5. Check if user is a mentor and their verification status
        console.log('5. Checking mentor verification status...');
        const mentorQuery = `
            SELECT
                id, status, verification_status, verified_at,
                background_check_status, completed_training,
                created_at, updated_at
            FROM mentors
            WHERE user_id = $1
        `;
        const mentorResult = await query(mentorQuery, [user.id]);

        if (mentorResult.rows.length === 0) {
            console.log('   - User is not a mentor\n');
        } else {
            const mentor = mentorResult.rows[0];
            console.log('   Mentor Details:');
            console.log(`     - Status: ${mentor.status}`);
            console.log(`     - Verification Status: ${mentor.verification_status}`);
            console.log(`     - Verified At: ${mentor.verified_at || 'Not verified'}`);
            console.log(`     - Background Check: ${mentor.background_check_status}`);
            console.log(`     - Training Completed: ${mentor.completed_training}`);
            console.log(`     - Created: ${mentor.created_at}`);
            console.log(`     - Updated: ${mentor.updated_at}\n`);
        }

        // 6. Check for any sessions (might indicate account activity)
        console.log('6. Checking session history...');
        const sessionsQuery = `
            SELECT
                COUNT(*) as total_sessions,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
                MIN(created_at) as first_session,
                MAX(created_at) as last_session
            FROM sessions
            WHERE mentee_id = $1 OR mentor_id IN (
                SELECT id FROM mentors WHERE user_id = $1
            )
        `;
        const sessionsResult = await query(sessionsQuery, [user.id]);

        const sessionStats = sessionsResult.rows[0];
        console.log('   Session Statistics:');
        console.log(`     - Total Sessions: ${sessionStats.total_sessions}`);
        console.log(`     - Completed Sessions: ${sessionStats.completed_sessions}`);
        console.log(`     - First Session: ${sessionStats.first_session || 'None'}`);
        console.log(`     - Last Session: ${sessionStats.last_session || 'None'}\n`);

        // 7. Analysis and Recommendations
        console.log('7. ANALYSIS AND FINDINGS:');
        console.log('========================');

        let issues = [];

        if (!user.is_verified) {
            console.log('❌ PRIMARY ISSUE: User is not verified (is_verified = false)');

            if (!user.email_verified_at) {
                issues.push('Email verification is pending - no email_verified_at timestamp');
            }

            if (emailTokensResult.rows.length === 0) {
                issues.push('No email verification tokens found - user may never have initiated verification');
            } else {
                const unusedTokens = emailTokensResult.rows.filter(t => !t.used_at);
                if (unusedTokens.length > 0) {
                    const expiredTokens = unusedTokens.filter(t => new Date(t.expires_at) < new Date());
                    if (expiredTokens.length > 0) {
                        issues.push(`${expiredTokens.length} unused verification tokens have expired`);
                    }
                    const activeTokens = unusedTokens.filter(t => new Date(t.expires_at) >= new Date());
                    if (activeTokens.length > 0) {
                        console.log(`✅ User has ${activeTokens.length} active verification tokens`);
                    }
                }
            }

            if (user.login_count === 0) {
                issues.push('User has never logged in - account may be inactive');
            }

            if (user.phone && !user.phone_verified_at) {
                issues.push('Phone verification is pending (phone provided but not verified)');
            }
        } else {
            console.log('✅ User is verified - investigating why API shows false');
            issues.push('Potential API caching issue or data synchronization problem');
        }

        if (issues.length > 0) {
            console.log('\n🔍 IDENTIFIED ISSUES:');
            issues.forEach((issue, index) => {
                console.log(`   ${index + 1}. ${issue}`);
            });
        }

        console.log('\n📋 RECOMMENDATIONS:');
        if (!user.is_verified) {
            console.log('   1. Check if user has received verification email');
            console.log('   2. Verify email service is working properly');
            console.log('   3. Check spam/junk folders for verification emails');
            console.log('   4. Consider manual verification if tokens are expired');
            console.log('   5. Verify email verification endpoint is functioning');
        } else {
            console.log('   1. Clear API cache or restart services');
            console.log('   2. Check for database connection issues');
            console.log('   3. Verify API query logic');
        }

    } catch (error) {
        console.error('❌ Error during investigation:', error.message);
        throw error;
    }
}

// Run the investigation
const userId = 73;
const uuid = 'fbe81d42-09a9-469c-ba0d-107771da17e2';

investigateUserVerification(userId, uuid)
    .then(() => {
        console.log('\n✅ Investigation completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Investigation failed:', error);
        process.exit(1);
    });