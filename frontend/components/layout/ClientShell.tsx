"use client";
import { useEffect, useRef, useState } from "react";

export default function ClientShell({ children }: { children: React.ReactNode }) {
  const cursorRef = useRef<HTMLDivElement>(null);

  /* Custom cursor ring */
  useEffect(() => {
    const ring = cursorRef.current;
    if (!ring) return;
    let x = 0, y = 0, tx = 0, ty = 0;
    const move = (e: MouseEvent) => { tx = e.clientX; ty = e.clientY; };
    const tick = () => {
      x += (tx - x) * 0.15;
      y += (ty - y) * 0.15;
      ring.style.left = x + "px";
      ring.style.top = y + "px";
      requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", move);
    requestAnimationFrame(tick);

    const addHover = () => ring.classList.add("hovering");
    const removeHover = () => ring.classList.remove("hovering");
    const targets = () => document.querySelectorAll("a, button, .card, .btn");
    const observer = new MutationObserver(() => {
      targets().forEach((el) => {
        el.addEventListener("mouseenter", addHover);
        el.addEventListener("mouseleave", removeHover);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    targets().forEach((el) => {
      el.addEventListener("mouseenter", addHover);
      el.addEventListener("mouseleave", removeHover);
    });

    return () => {
      window.removeEventListener("mousemove", move);
      observer.disconnect();
    };
  }, []);

  /* Scroll reveal (Intersection Observer) */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    const attach = () =>
      document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    attach();
    const mo = new MutationObserver(attach);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); mo.disconnect(); };
  }, []);

  return (
    <>
      {/* Custom cursor */}
      <div ref={cursorRef} className="cursor-ring" />

      {children}
    </>
  );
}
