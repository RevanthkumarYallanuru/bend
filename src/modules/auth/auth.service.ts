import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { prisma } from "../../config/database";

import type { LoginInput } from "./auth.validation";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "JWT_SECRET is not configured"
    );
  }

  return secret;
}

function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || "8h";
}

export async function loginUser(
  data: LoginInput
) {
  const user = await prisma.users.findFirst({
    where: {
      username: data.username,
      is_active: true,
    },
    include: {
      businesses: true,
    },
  });

  if (!user) {
    throw new Error(
      "Invalid username or password"
    );
  }

  const passwordMatches =
    await bcrypt.compare(
      data.password,
      user.password_hash
    );

  if (!passwordMatches) {
    throw new Error(
      "Invalid username or password"
    );
  }

  if (!user.businesses?.is_active) {
    throw new Error(
      "Business account is inactive"
    );
  }

  const token = jwt.sign(
    {
      userId: user.id.toString(),
      businessId: user.business_id.toString(),
      role: user.role,
      username: user.username,
    },
    getJwtSecret(),
    {
      expiresIn: getJwtExpiresIn() as jwt.SignOptions["expiresIn"],
    }
  );

  await prisma.users.update({
    where: {
      id: user.id,
    },
    data: {
      last_login_at: new Date(),
    },
  });

  return {
    token,

    user: {
      id: user.id.toString(),
      business_id: user.business_id.toString(),
      name: user.name,
      username: user.username,
      role: user.role,
    },

    business: {
      id: user.businesses.id.toString(),
      name: user.businesses.name,
      proprietor_name: user.businesses.proprietor_name,
      name_display_mode: user.businesses.name_display_mode,
      print_language: user.businesses.print_language,
      bill_note: user.businesses.bill_note,
      phone: user.businesses.phone,
      alternate_phone: user.businesses.alternate_phone,
      address: user.businesses.address,
      upi_id: user.businesses.upi_id,
      upi_phone: user.businesses.upi_phone,
      bill_item_row_count: user.businesses.bill_item_row_count,
    },
  };
}

export async function getCurrentUser(
  userId: bigint
) {
  return prisma.users.findFirst({
    where: {
      id: userId,
      is_active: true,
    },
    include: {
      businesses: true,
    },
  });
}