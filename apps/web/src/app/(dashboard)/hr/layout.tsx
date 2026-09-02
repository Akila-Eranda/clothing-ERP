import { HrSectionNav } from "@/components/hr/hr-section-nav";

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="page-shell pt-4">
        <HrSectionNav />
      </div>
      {children}
    </div>
  );
}
