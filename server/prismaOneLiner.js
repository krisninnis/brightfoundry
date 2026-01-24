const prisma = require("./prismaClient");

(async () => {
  try {
    const msg = await prisma.message.findFirst();
    console.log("message:", msg);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
})();
