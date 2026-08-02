import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AutomationDashboard } from "@/features/automation/automation-dashboard"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ workflow?: string }>
}) {
  const params = await searchParams
  const workflow = params.workflow === "newsletter" ? "newsletter" : "carousel"

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 14)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" workflow={workflow} />
      <SidebarInset>
        <AutomationDashboard workflow={workflow} />
      </SidebarInset>
    </SidebarProvider>
  )
}
