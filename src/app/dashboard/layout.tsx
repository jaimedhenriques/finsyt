import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard - Finsyt',
  description: 'AI-powered financial research dashboard',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
