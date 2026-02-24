"use client";

import * as React from "react";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";

interface MenuToggleProps extends React.SVGAttributes<SVGSVGElement> {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}

function MenuToggle({ open, onOpenChange, className, ...props }: MenuToggleProps) {
  const Icon = open ? X : Menu;
  return (
    <Icon
      role="button"
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      className={cn("shrink-0", className)}
      onClick={() => onOpenChange?.(!open)}
      {...props}
    />
  );
}

export { MenuToggle };
