"use client";

import type { ReactNode } from "react";
import { getLocalizedText, type Locale } from "../i18n";
import "./member-card.css";

/** The public page and the unsaved console preview share this exact summary layout. */
export function MemberCard({ member, locale, portrait, onOpenProfile }: { member: any; locale: Locale; portrait: ReactNode; onOpenProfile?: () => void }) {
  const zh = locale === "zh", text = (value: unknown) => getLocalizedText(value, locale);
  const identity = [text(member.role), text(member.degree), text(member.enrollmentYear), text(member.graduation)]
    .filter(Boolean).join(" · ");
  return <article className="rnav-member-card" id={member.slug}>
    <div className="rnav-member-summary">
      <div className="rnav-member-portrait">{portrait}</div>
      <div className="rnav-member-copy">
        {onOpenProfile ? <h3><button aria-haspopup="dialog" onClick={onOpenProfile} type="button">{text(member.name)}</button></h3> : <h3>{text(member.name)}</h3>}
        {zh && member.name?.en ? <p className="rnav-member-en">{member.name.en}</p> : null}
        {identity ? <p className="rnav-member-identity">{identity}</p> : null}
        {(text(member.research) || text(member.focus)) ? <p className="rnav-member-research">{text(member.research) || text(member.focus)}</p> : null}
      </div>
    </div>
  </article>;
}
