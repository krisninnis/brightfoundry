const prisma = require("./prismaClient");

async function main() {
  const msg = await prisma.message.findFirst();
  const ticket = await prisma.supportTicket.findFirst();
  console.log("message:", msg);
  console.log("ticket:", ticket);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });

  