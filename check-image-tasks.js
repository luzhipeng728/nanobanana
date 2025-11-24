const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkImageTasks() {
  try {
    console.log('=== Recent ImageTask Status ===');
    const tasks = await prisma.imageTask.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    tasks.forEach(task => {
      console.log(`\nTask ID: ${task.id}`);
      console.log(`Status: ${task.status}`);
      console.log(`Prompt: ${task.prompt.slice(0, 50)}...`);
      console.log(`Model: ${task.model}`);
      console.log(`Created: ${task.createdAt}`);
      console.log(`Updated: ${task.updatedAt}`);
      if (task.error) {
        console.log(`Error: ${task.error}`);
      }
      if (task.imageUrl) {
        console.log(`Image URL: ${task.imageUrl}`);
      }
    });
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkImageTasks();
