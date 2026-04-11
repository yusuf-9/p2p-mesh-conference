import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: '../.env' });

const JWT_SUPER_ADMIN_SECRET = process.env.JWT_SUPER_ADMIN_SECRET || "super-admin-secret-key-prod-2024-abcdef123456";
const expiresIn = "15m"; // Default to 15 minutes if not specified

async function main() {
  try {
    // Check if we're using the fallback secret and warn the user
    if (!process.env.JWT_SUPER_ADMIN_SECRET) {
      console.warn('⚠️  WARNING: JWT_SUPER_ADMIN_SECRET not found in environment variables. Using fallback secret.');
      console.warn('⚠️  Please create a .env file based on env.example and set JWT_SUPER_ADMIN_SECRET.');
      throw new Error('JWT_SUPER_ADMIN_SECRET not found in environment variables');
    }

    const token = jwt.sign({
      type: "super-admin"
    }, JWT_SUPER_ADMIN_SECRET, {
      expiresIn: expiresIn
    });

    console.log("Token generated successfully! \n", token);
    console.log(`\nToken expires in: ${expiresIn}`);
    console.log(`Using secret from: ${process.env.JWT_SUPER_ADMIN_SECRET ? 'environment variables' : 'fallback'}`);
  } catch (error) {
    console.error('Error creating token:', error);
    throw new Error('Failed to create token');
  }
}

main()
