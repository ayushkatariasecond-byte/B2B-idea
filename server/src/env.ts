import dotenv from 'dotenv';

dotenv.config();

export const env = {
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  port: Number(process.env.PORT) || 4000,
};
