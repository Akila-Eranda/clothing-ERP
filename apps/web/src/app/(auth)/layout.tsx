/** Auth screens always use a fixed light palette (form panel is white). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="light min-h-screen bg-white text-slate-900">{children}</div>;
}
