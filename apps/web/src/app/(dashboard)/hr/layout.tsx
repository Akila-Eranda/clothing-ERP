import { HrSectionNav } from "@/components/hr/hr-section-nav";

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <HrSectionNav />
      {children}
    </div>
  );
}
