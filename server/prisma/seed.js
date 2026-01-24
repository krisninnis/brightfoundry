const prisma = require("../prismaClient");
const bcrypt = require("bcrypt");

// Safety: never seed production
if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed in production.");
}

// Optional: override demo passwords via env for local/staging.
// Defaults are fine for local dev, but do NOT use them in any shared environment.
const ADMIN_SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "admin123";
const CLIENT_SEED_PASSWORD = process.env.SEED_CLIENT_PASSWORD || "client123";

if (!process.env.SEED_ADMIN_PASSWORD || !process.env.SEED_CLIENT_PASSWORD) {
  console.warn(
    "⚠️  Using default seed passwords. Set SEED_ADMIN_PASSWORD and SEED_CLIENT_PASSWORD to override."
  );
}

async function main() {
  console.log("🌱 Seeding database...");

  // 1) Admin user
  const adminPasswordHash = await bcrypt.hash(ADMIN_SEED_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@brightfoundry.test" },
    update: {},
    create: {
      name: "BrightFoundry Admin",
      email: "admin@brightfoundry.test",
      password: adminPasswordHash,
      role: "admin",
    },
  });

  // 2) Demo client user
  const clientPasswordHash = await bcrypt.hash(CLIENT_SEED_PASSWORD, 10);

  const client = await prisma.user.upsert({
    where: { email: "client@example.com" },
    update: {},
    create: {
      name: "Demo Client",
      email: "client@example.com",
      password: clientPasswordHash,
      role: "client",
    },
  });

  // 3) Demo project for the client
  const project = await prisma.project.create({
    data: {
      name: "Demo Website Project",
      status: "design",
      description: "A demo project to show in the BrightFoundry portal.",
      ownerId: client.id,
    },
  });

  // 4) Optional demo message
  await prisma.message.create({
    data: {
      body: "Hey, just checking in about the homepage layout. Looks great so far!",
      fromRole: "client",
      userId: client.id,
      projectId: project.id,
    },
  });

  // 5) Optional demo invoice
  await prisma.invoice.create({
    data: {
      title: "Initial Project Deposit",
      amount: 500.0,
      status: "unpaid",
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      userId: client.id,
      projectId: project.id,
    },
  });

  // 6) Optional demo file
  await prisma.file.create({
    data: {
      filename: "brand-guidelines.pdf",
      url: "https://example.com/files/brand-guidelines.pdf",
      type: "document",
      userId: client.id,
      projectId: project.id,
    },
  });

  // 7) Optional support ticket
  await prisma.supportTicket.create({
    data: {
      subject: "Can we update the contact form?",
      status: "open",
      userId: client.id,
      projectId: project.id,
    },
  });

  // 8) Optional timeline event
  await prisma.timelineEvent.create({
    data: {
      label: "Project created",
      type: "milestone",
      userId: client.id,
      projectId: project.id,
    },
  });

  console.log("✅ Seed complete!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("❌ Seed error:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
