import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: {
    appIsrStatus: false,
  },
  allowedDevOrigins: ['127.0.0.1', 'localhost', '192.168.1.11'],
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: "dummy-org",
  project: "dummy-project",
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  disableLogger: true,
});
