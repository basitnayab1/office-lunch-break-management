export const dynamic = "force-dynamic";

/** Pass-through layout so /admin/login is not wrapped by the dashboard shell. */
export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
