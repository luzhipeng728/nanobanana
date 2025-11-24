const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkErrors() {
  try {
    console.log('=== Checking MusicTask Errors ===');
    const musicTasks = await prisma.musicTask.findMany({
      where: { status: 'failed' },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    musicTasks.forEach(task => {
      console.log(`\nTask ID: ${task.id}`);
      console.log(`Status: ${task.status}`);
      console.log(`Prompt: ${task.prompt}`);
      console.log(`Error: ${task.error}`);
      console.log(`External Task ID: ${task.externalTaskId}`);
    });

    console.log('\n=== Checking VideoTask Errors ===');
    const videoTasks = await prisma.videoTask.findMany({
      where: { status: 'failed' },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    videoTasks.forEach(task => {
      console.log(`\nTask ID: ${task.id}`);
      console.log(`Status: ${task.status}`);
      console.log(`Prompt: ${task.prompt}`);
      console.log(`Error: ${task.error}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkErrors();
