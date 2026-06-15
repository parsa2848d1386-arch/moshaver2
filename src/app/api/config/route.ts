import { NextResponse } from 'next/server';

export async function GET() {
  // این وب‌سرویس مشخصات پیکربندی عمومی فایربیس را بازمی‌گرداند.
  // اطلاعات حساس مانند FIREBASE_SERVICE_ACCOUNT_JSON هرگز از این سرویس بازگردانده نخواهند شد.
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || "",
  };

  const isConfigured = 
    config.apiKey && 
    !config.apiKey.includes('dummy-api-key') && 
    config.apiKey !== '';

  return NextResponse.json({
    configured: !!isConfigured,
    config: isConfigured ? config : null
  });
}
