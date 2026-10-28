const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findDuplicates() {
  try {
    const sessions = await prisma.inspectionSession.findMany({
      include: { balloons: { orderBy: { balloonNumber: 'asc' } } }
    });
    
    for (const session of sessions) {
      const numberCounts = {};
      for (const balloon of session.balloons) {
        numberCounts[balloon.balloonNumber] = (numberCounts[balloon.balloonNumber] || 0) + 1;
      }
      
      const duplicates = Object.entries(numberCounts).filter(([num, count]) => count > 1);
      if (duplicates.length > 0) {
        console.log(`Session "${session.name}" (${session.id}):`);
        for (const [num, count] of duplicates) {
          console.log(`  Balloon #${num} appears ${count} times`);
          const dupes = session.balloons.filter(b => b.balloonNumber === parseInt(num));
          // Keep first, renumber others
          for (let i = 1; i < dupes.length; i++) {
            const maxNum = Math.max(...session.balloons.map(b => b.balloonNumber));
            const newNum = maxNum + i;
            console.log(`    Renumbering ${dupes[i].id} to #${newNum}`);
            await prisma.balloon.update({
              where: { id: dupes[i].id },
              data: { balloonNumber: newNum }
            });
          }
        }
      }
    }
    
    console.log('✓ Fixed all duplicates');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findDuplicates();
