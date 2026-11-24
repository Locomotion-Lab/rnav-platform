import type { Degree, MemberProfile } from "./profileModel";

/** Mirror the public DTO, never include account email or private phone. */
export function memberPreview(member: MemberProfile) {
  const fields = new Set(member.publicFields),
    alumni = member.memberStatus === "alumni";
  const localized = (field: string, zh: string, en: string) =>
    fields.has(field) ? { zh, en } : { zh: "", en: "" };
  const degrees: Record<Degree, [string, string]> = {
    phd: ["博士", "PhD"], master: ["硕士", "Master"], undergrad: ["本科", "Bachelor"],
  };
  const highest = (Object.keys(degrees) as Degree[]).find((key) => member.degrees.includes(key));
  const [degreeZh, degreeEn] = highest ? degrees[highest] : ["", ""];
  const identityVisible = fields.has("academic_stage");
  const teacher = member.memberRole === "teacher";
  const enrollmentVisible = !teacher && fields.has("enrollment_year") && member.enrollmentYear;
  const graduationVisible = fields.has("graduation_year") && member.graduationYear;
  return {
    name: {
      zh: fields.has("name_zh") ? member.nameZh : "",
      en: fields.has("name_en") ? member.nameEn : "",
    },
    role: identityVisible && teacher ? { zh: "老师", en: "Faculty" } : { zh: "", en: "" },
    degree: !alumni && identityVisible && degreeZh
      ? enrollmentVisible
        ? { zh: `${member.enrollmentYear}级${degreeZh}`, en: `${degreeEn}, Class of ${member.enrollmentYear}` }
        : { zh: degreeZh, en: degreeEn }
      : { zh: "", en: "" },
    enrollmentYear: !alumni && !(identityVisible && degreeZh) && enrollmentVisible
      ? { zh: `${member.enrollmentYear}级`, en: `Class of ${member.enrollmentYear}` }
      : { zh: "", en: "" },
    graduation: alumni
      ? {
          zh: `${graduationVisible ? `${member.graduationYear}届` : ""}${identityVisible ? degreeZh : ""}`,
          en: [identityVisible ? degreeEn : "", graduationVisible ? `Graduated ${member.graduationYear}` : ""].filter(Boolean).join(", "),
        }
      : null,
    major: localized("major", member.majorZh, member.majorEn),
    research: localized(
      "research",
      member.researchInterestsZh,
      member.researchInterestsEn,
    ),
    bio: localized("bio", member.bioZh, member.bioEn),
    thesis: alumni
      ? localized("thesis", member.thesisZh, member.thesisEn)
      : null,
    destination: alumni
      ? localized("destination", member.destinationZh, member.destinationEn)
      : null,
    image:
      fields.has("avatar") && member.avatarUrl
        ? {
            src: member.avatarUrl,
            positionX: member.avatarPositionX,
            positionY: member.avatarPositionY,
            zoom: member.avatarZoom,
          }
        : null,
    links: fields.has("links")
      ? member.personalLinks.map((link) => ({
          label: { zh: link.labelZh, en: link.labelEn },
          href: link.url,
        }))
      : [],
    contacts: [
      ...(fields.has("email") && member.publicEmail
        ? [
            {
              label: { zh: "邮箱", en: "Email" },
              value: { zh: member.publicEmail, en: member.publicEmail },
            },
          ]
        : []),
      ...(fields.has("phone") && member.phone
        ? [{ label: { zh: "电话", en: "Phone" }, value: { zh: member.phone, en: member.phone } }]
        : []),
    ],
  };
}
