class AppConfig {
  static const String supabaseUrl = 'https://nvewoijluolkxrszeoar.supabase.co';
  static const String supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52ZXdvaWpsdW9sa3hyc3plb2FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNTM5MjMsImV4cCI6MjA5NjgyOTkyM30.iNqTzBL3uvkGwrLsfSsh9mu7VzE6x6E19iWNFuQSITs';
  static const String gatewayKey = 'jarvis-super-secret-key-2026';
  
  // Set to 'https://personal-asistan-firsyah.vercel.app' for production hosting,
  // or 'http://10.0.2.2:3000' for Android emulator local Next.js dev server.
  static const String webAppUrl = 'https://personal-asistan-firsyah.vercel.app';
  static const String localWebAppUrl = 'http://192.168.1.11:3000';
  static const bool useLocalDevServer = false;
  static String get activeUrl => useLocalDevServer ? localWebAppUrl : webAppUrl;
  
  // Sentry DSN configuration for Layer 12 error tracking
  // Using a sample client DSN to verify integration works
  static const String sentryDsn = 'https://6d636a4e7d6fb8fb2e30c8b3562a2f08@o4511641680281600.ingest.de.sentry.io/4511641691029584';
}
