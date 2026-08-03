import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AutomationDashboard } from "@/features/automation/automation-dashboard"
import { PipelineWorkspace } from "@/features/pipeline/pipeline-workspace"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ workflow?: string; view?: string }>
}) {
  const params = await searchParams
  const view = params.view === "pipeline" ? "pipeline" : "automation"
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
      <AppSidebar variant="inset" workflow={workflow} view={view} />
      <SidebarInset>
        {view === "pipeline" ? (
          <PipelineWorkspace />
        ) : (
          <AutomationDashboard workflow={workflow} />
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
