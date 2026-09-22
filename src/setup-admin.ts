import bcrypt from "bcryptjs";

import { prisma } from "./config/database";

async function setupAdmin() {
  const username = "admin";
  const password = "ChangeMe@123";

  const passwordHash = await bcrypt.hash(
    password,
    12
  );

  const existingUser =
    await prisma.users.findFirst({
      where: {
        username,
      },
    });

  if (existingUser) {
    await prisma.users.update({
      where: {
        id: existingUser.id,
      },
      data: {
        password_hash: passwordHash,
        role: "ADMIN",
        is_active: true,
      },
    });

    console.log(
      "Admin user already existed."
    );

    console.log(
      "Admin password has been reset."
    );

    return;
  }

  const user = await prisma.users.create({
    data: {
      business_id: BigInt(1),
      name: "Administrator",
      username,
      password_hash: passwordHash,
      role: "ADMIN",
      is_active: true,
    },
  });

  console.log(
    `Admin created. ID: ${user.id.toString()}`
  );
}

setupAdmin()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });