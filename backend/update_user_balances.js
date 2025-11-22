require('dotenv').config();
const { query } = require('./config/database');

async function updateBalances() {
  try {
    console.log('Updating all user balances to 10000 for testing...');

    const result = await query('UPDATE wallets SET balance = 10000');

    console.log(`✅ Successfully updated ${result.rowCount} wallet balances to 10000`);

    // Optional: Log the updated balances
    const checkResult = await query('SELECT COUNT(*) as total_wallets, SUM(balance) as total_balance FROM wallets');
    console.log(`📊 Total wallets: ${checkResult.rows[0].total_wallets}, Total balance: ${checkResult.rows[0].total_balance}`);

  } catch (error) {
    console.error('❌ Error updating balances:', error.message);
    process.exit(1);
  }
}

// Run the update
updateBalances().then(() => {
  console.log('🎉 Balance update completed');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});