import type { Metadata } from 'next';
import './dashboard.css';

export const metadata: Metadata = {
  title: 'AI Personal Assistant Dashboard',
  description: 'Private Cognitive Analytics and Insights Dashboard',
  robots: 'noindex, nofollow',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
    </>
  );
}
