// =====================================================================
// 공용 아이콘 — Lucide React(상용 표준 라인 아이콘).
//  - <Icon name={key} /> API 유지 → 사이드바·프로세스 플로우·스탯카드 등 기존 호출부 그대로.
//  - stroke=currentColor 라 색은 상위 요소 color 로 제어(size/strokeWidth 조절 가능).
// =====================================================================
import React from 'react'
import {
  LayoutDashboard, Building2, Globe, ShieldAlert, FlaskConical, BookOpen,
  Package, CheckCircle2, Eye, ScrollText, Users, Boxes,
  Download, Wrench, RefreshCw, Send, Circle, Menu, Bell, Info, Square
} from 'lucide-react'

// name(주로 nav key / 프로세스·스탯 키) → Lucide 컴포넌트
const ICONS = {
  dashboard: LayoutDashboard,
  customers: Building2,
  domains: Globe,
  findings: ShieldAlert,
  sandbox: FlaskConical,
  guides: BookOpen,
  evidence: Package,
  review: CheckCircle2,
  'customer-view': Eye,
  audit: ScrollText,
  users: Users,
  'lab-studio': Boxes,
  // 대시보드 프로세스/스탯 보조
  collect: Download,
  remediation: Wrench,
  rescan: RefreshCw,
  delivery: Send,
  // 헤더/공용 컨트롤
  menu: Menu,
  bell: Bell,
  info: Info,
  square: Square
}

export function Icon({ name, size = 18, strokeWidth = 1.8, className }) {
  const Cmp = ICONS[name] || Circle
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />
}
