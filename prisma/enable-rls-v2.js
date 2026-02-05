const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function enableRLS() {
  console.log('\n🔒 Enabling Row Level Security on all tables...\n');

  const tables = [
    'Users', 'Bots', 'Accounts', 'Sessions', 'Games', 'Players',
    'Lobbies', 'Friendships', 'FriendRequests', 'EmailVerificationTokens',
    'PasswordResetTokens', 'VerificationTokens', 'SpyLocations'
  ];

  try {
    // Step 1: Enable RLS on all tables
    console.log('📋 Step 1: Enabling RLS...\n');
    
    for (const table of tables) {
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
        console.log(`   ✅ RLS enabled on ${table}`);
      } catch (error) {
        if (error.message.includes('already has row security')) {
          console.log(`   ℹ️  RLS already enabled on ${table}`);
        } else {
          console.error(`   ❌ Error on ${table}:`, error.message);
        }
      }
    }

    // Step 2: Create permissive policies
    console.log('\n📋 Step 2: Creating service role policies...\n');

    for (const table of tables) {
      try {
        // Drop existing policy if exists
        await prisma.$executeRawUnsafe(
          `DROP POLICY IF EXISTS "Service role full access" ON "${table}";`
        );
        
        // Create new policy
        await prisma.$executeRawUnsafe(`
          CREATE POLICY "Service role full access" ON "${table}"
            FOR ALL
            USING (true)
            WITH CHECK (true);
        `);
        
        console.log(`   ✅ Policy created for ${table}`);
      } catch (error) {
        console.error(`   ❌ Error creating policy for ${table}:`, error.message);
      }
    }

    // Step 3: Verify
    console.log('\n🔍 Verifying RLS status...\n');

    const rlsStatus = await prisma.$queryRaw`
      SELECT 
        tablename,
        rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = ANY(${tables})
      ORDER BY tablename;
    `;

    console.log('📊 RLS Status:\n');
    rlsStatus.forEach(row => {
      const status = row.rowsecurity ? '🟢 ENABLED' : '🔴 DISABLED';
      console.log(`   ${status} - ${row.tablename}`);
    });

    const policyCount = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = ANY(${tables});
    `;

    console.log(`\n📋 Total RLS policies created: ${policyCount[0].count}\n`);

    console.log('🎉 RLS setup complete!\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

enableRLS();
