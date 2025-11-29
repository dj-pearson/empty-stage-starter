import { Users, Database, Brain, UserCog, CreditCard, Target, Share2, BookOpen, Mail, Search, Percent, Gift, Flag, Ticket, UserPlus, Sparkles, BarChart3, DollarSign, TrendingUp } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";

const adminItems = [
  { title: "User Intelligence", value: "intelligence", icon: Sparkles },
  { title: "Conversion Funnel", value: "funnel", icon: TrendingUp },
  { title: "Revenue Operations", value: "revenue-ops", icon: DollarSign },
  { title: "Support Performance", value: "support-performance", icon: BarChart3 },
  { title: "Support Tickets", value: "tickets", icon: Ticket },
  { title: "Users", value: "users", icon: UserCog },
  { title: "Subscriptions", value: "subscriptions", icon: CreditCard },
  { title: "Complementary", value: "complementary", icon: Gift },
  { title: "Referrals", value: "referrals", icon: UserPlus },
  { title: "Promos", value: "campaigns", icon: Percent },
  { title: "Leads", value: "leads", icon: Target },
  { title: "Social", value: "social", icon: Share2 },
  { title: "Blog", value: "blog", icon: BookOpen },
  { title: "Email", value: "email", icon: Mail },
  { title: "SEO", value: "seo", icon: Search },
  { title: "Feature Flags", value: "flags", icon: Flag },
  { title: "Nutrition", value: "nutrition", icon: Database },
  { title: "Roles", value: "roles", icon: Users },
  { title: "AI", value: "ai", icon: Brain },
];

interface AdminSidebarProps {
  activeTab: string;
  onTabChange: (value: string) => void;
}

export function AdminSidebar({ activeTab, onTabChange }: AdminSidebarProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Admin Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.value}>
                  <SidebarMenuButton
                    onClick={() => onTabChange(item.value)}
                    isActive={activeTab === item.value}
                    tooltip={item.title}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
