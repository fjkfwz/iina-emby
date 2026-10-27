import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import type React from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type PopoverPlacement, usePopoverPosition } from "../../hooks/usePopoverPosition";
import classes from "./Select.module.css";

export type { PopoverPlacement };

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  data: (string | SelectOption)[];
  value?: string | null;
  onChange?: (value: string | null) => void;
  allowDeselect?: boolean;
  className?: string;
  placeholder?: string;
  /** Static icon to show in trigger (e.g. Filter or Sort icon), or defaults to selected option's icon */
  icon?: React.ReactNode;
  size?: "sm" | "md";
  disabled?: boolean;
  placement?: PopoverPlacement;
}

export function Select({
  data,
  value,
  onChange,
  allowDeselect = false,
  className,
  placeholder = "Select...",
  icon,
  size = "md",
  disabled = false,
  placement = "bottom-start",
}: SelectProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const typeaheadQuery = useRef("");
  const typeaheadTimer = useRef<number | null>(null);

  const normalizedOptions: SelectOption[] = data.map((item) => (typeof item === "string" ? { value: item, label: item } : item));

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);
  const displayIcon = icon ?? selectedOption?.icon;

  const { updatePosition } = usePopoverPosition({
    triggerRef,
    popoverRef: menuRef,
    placement,
    offset: 4,
  });

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Click outside to close (compatible with all WebKit / Safari versions)
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  // Sync position and focus active item when opened
  useLayoutEffect(() => {
    if (!isOpen) return;

    const m = menuRef.current;
    const tr = triggerRef.current;
    if (m && tr) {
      m.style.minWidth = `${tr.offsetWidth}px`;
    }

    updatePosition();

    const selectedBtn = m?.querySelector<HTMLElement>(`[role="option"][aria-selected="true"]`);
    const firstBtn = m?.querySelector<HTMLElement>(`[role="option"]:not([aria-disabled="true"])`);
    const target = selectedBtn ?? firstBtn;
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "nearest" });
    }

    const onScrollOrResize = (e: Event) => {
      if (e.target && menuRef.current?.contains(e.target as Node)) {
        return;
      }
      close();
    };
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [isOpen, updatePosition, close]);

  const handleSelect = (optValue: string) => {
    if (allowDeselect && optValue === value) {
      onChange?.(null);
    } else {
      onChange?.(optValue);
    }
    close();
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (disabled) return;
    setIsOpen((prev) => !prev);
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])') ?? []);
    if (!items.length) return;

    const idx = items.indexOf(document.activeElement as HTMLElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = (idx + 1) % items.length;
      items[next]?.focus();
      items[next]?.scrollIntoView({ block: "nearest" });
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = idx === -1 ? items.length - 1 : (idx - 1 + items.length) % items.length;
      items[prev]?.focus();
      items[prev]?.scrollIntoView({ block: "nearest" });
      return;
    }

    if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
      items[0]?.scrollIntoView({ block: "nearest" });
      return;
    }

    if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
      items[items.length - 1]?.scrollIntoView({ block: "nearest" });
      return;
    }

    if (e.key === "Tab") {
      close();
      return;
    }

    // Typeahead search
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (typeaheadTimer.current) {
        window.clearTimeout(typeaheadTimer.current);
      }
      typeaheadQuery.current += e.key.toLowerCase();
      typeaheadTimer.current = window.setTimeout(() => {
        typeaheadQuery.current = "";
      }, 500);

      const match = items.find((item) => item.textContent?.toLowerCase().trim().startsWith(typeaheadQuery.current));
      if (match) {
        e.preventDefault();
        match.focus();
        match.scrollIntoView({ block: "nearest" });
      }
    }
  };

  return (
    <div className={`${classes.container} ${className || ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`${classes.trigger} ${size === "sm" ? classes.triggerSm : ""}`}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={id}
        disabled={disabled}
      >
        <span className={classes.triggerLeft}>
          {displayIcon && <span className={classes.triggerIcon}>{displayIcon}</span>}
          <span className={classes.value}>{selectedOption ? selectedOption.label : placeholder}</span>
        </span>
        <span className={`${classes.chevron} ${isOpen ? classes.chevronOpen : ""}`}>
          <IconChevronDown size={14} stroke={2} />
        </span>
      </button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            id={id}
            role="listbox"
            aria-label={placeholder}
            tabIndex={-1}
            className={`${classes.dropdown} ${classes.dropdownOpen}`}
            onKeyDown={handleMenuKeyDown}
            onClick={(e) => e.stopPropagation()}
          >
            {normalizedOptions.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`${classes.item} ${isSelected ? classes.itemSelected : ""}`}
                  onClick={() => !opt.disabled && handleSelect(opt.value)}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled || undefined}
                  disabled={opt.disabled}
                  tabIndex={-1}
                >
                  {opt.icon && <span className={classes.itemIcon}>{opt.icon}</span>}
                  <span className={classes.label}>{opt.label}</span>
                  {isSelected && (
                    <span className={classes.checkIcon}>
                      <IconCheck size={14} stroke={2.2} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
