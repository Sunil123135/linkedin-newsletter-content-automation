"use client"

import * as React from "react"
import Link from "next/link"
import { BookOpenTextIcon, ImagesIcon, OrbitIcon } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { WorkflowKind } from "@/features/automation/types"

const workflows = [
  {
    kind: "carousel" as const,
    title: "LinkedIn Carousel Automation",
    href: "/dashboard?workflow=carousel",
    icon: ImagesIcon,
  },
  {
    kind: "newsletter" as const,
    title: "Newsletter",
    href: "/dashboard?workflow=newsletter",
    icon: BookOpenTextIcon,
  },
]

export function AppSidebar({
  workflow,
  ...props
}: React.ComponentProps<typeof Sidebar> & { workflow: WorkflowKind }) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <OrbitIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-heading text-base font-semibold tracking-tight">
              Automation Studio
            </p>
            <p className="text-[10px] font-semibold tracking-[0.15em] text-sidebar-foreground/55 uppercase">
              Content workflows
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pt-4">
          <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {workflows.map((item) => (
                <SidebarMenuItem key={item.kind}>
                  <SidebarMenuButton
                    isActive={workflow === item.kind}
                    tooltip={item.title}
                    className="h-auto min-h-10 py-2"
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span className="text-sm leading-snug">{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium">
            <span className="size-2 rounded-full bg-chart-2" /> UI simulation
          </div>
          <p className="text-[10px] leading-relaxed text-sidebar-foreground/55">
            Workflow execution is previewed locally.
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
