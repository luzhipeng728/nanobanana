const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkTasks() {
  try {
    console.log('=== Checking MusicTask ===');
    const musicTasks = await prisma.musicTask.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    console.log(`Found ${musicTasks.length} music tasks`);
    musicTasks.forEach(task => {
      console.log(`- ID: ${task.id.substring(0, 8)}, Status: ${task.status}, Created: ${task.createdAt}`);
    });

    console.log('\n=== Checking VideoTask ===');
    const videoTasks = await prisma.videoTask.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    console.log(`Found ${videoTasks.length} video tasks`);
    videoTasks.forEach(task => {
      console.log(`- ID: ${task.id.substring(0, 8)}, Status: ${task.status}, Created: ${task.createdAt}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkTasks();
