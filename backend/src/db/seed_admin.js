/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HRL SYNC HUB — ADMIN SEED SCRIPT (SUPABASE VERSION)
 * ═══════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { query, queryOne } = require('../db/pool');
const { logger } = require('../utils/logger');

const seedAdmin = async () => {
    const adminEmail = 'hardbanrecordslab.pl@gmail.com';
    const adminPass = 'Kskomra19840220!';

    logger.info(`Seeding admin user into Supabase Auth and Public DB: ${adminEmail}`);

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    try {
        // 1. Manage Supabase Auth first
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) throw listError;

        let finalUserId;
        const found = users.find(u => u.email === adminEmail);

        if (found) {
            finalUserId = found.id;
            await supabase.auth.admin.updateUserById(finalUserId, { password: adminPass, email_confirm: true });
            logger.info(`Existing Auth user updated (ID: ${finalUserId})`);
        } else {
            const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
                email: adminEmail,
                password: adminPass,
                email_confirm: true,
                user_metadata: { full_name: 'HRL Admin' }
            });
            if (createError) throw createError;
            finalUserId = user.id;
            logger.info(`Created new Auth user (ID: ${finalUserId})`);
        }

        // 2. Clear potential conflicting entries in our public table if the ID doesn't match
        // and Update the correct one to admin
        await query('DELETE FROM users WHERE email = $1 AND id != $2', [adminEmail, finalUserId]);

        await query(
            `INSERT INTO users (id, email, is_admin, full_name) 
             VALUES ($1, $2, true, 'HRL Admin')
             ON CONFLICT (id) DO UPDATE SET is_admin = true, full_name = 'HRL Admin', updated_at = now()`,
            [finalUserId, adminEmail]
        );

        logger.info('✅ Public.users table sync complete.');
        logger.info('🚀 ADMIN SETUP SUCCESSFUL. You can now log in.');

    } catch (e) {
        logger.error('❌ Admin seeding failed: ' + e.message);
        process.exit(1);
    }
};

if (require.main === module) {
    seedAdmin().then(() => process.exit(0));
}

module.exports = seedAdmin;
