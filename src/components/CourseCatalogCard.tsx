import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { SignedImage, useMediaUrl } from "./SignedImage";
import { useSiteSettings } from "@/lib/settings";
import type { CoursePresentation } from "@/lib/course-presentation";

export function CourseSponsor({ details }: { details?: CoursePresentation | undefined }) {
  const settings = useSiteSettings();
  return (
    <span className="flex items-center gap-2 text-sm text-foreground">
      {details?.sponsorLogo ? (
        <SignedImage
          path={details.sponsorLogo}
          alt=""
          className="h-7 w-7 rounded border border-border bg-white object-contain p-0.5"
        />
      ) : (
        <BookOpen className="h-5 w-5 text-primary" />
      )}
      {details?.sponsor || settings["site_name"] || "Math & Finance Pro"}
    </span>
  );
}

export function CourseCatalogCard({
  course,
  details,
  onEdit,
}: {
  course: {
    id: string;
    subject_id: string;
    title: string;
    code: string;
    description?: string;
    price?: number;
  };
  details?: CoursePresentation | undefined;
  onEdit?: () => void;
}) {
  const coverUrl = useMediaUrl(details?.cover);
  const cardClass = "group relative flex h-full flex-col rounded-xl border border-border bg-card p-2 transition duration-200 hover:-translate-y-1 hover:border-primary hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";
  const content = (
    <>
      <div className={`relative mb-4 aspect-[16/9] overflow-hidden rounded-lg ${onEdit ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200" : "bg-accent text-primary"}`}>
        {coverUrl ? (
          <img src={coverUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <div aria-hidden="true" className="flex h-full items-center justify-between gap-3 p-5">
            <span className={`line-clamp-3 font-bold leading-tight ${onEdit ? "text-base" : "text-xl"}`}>{course.title}</span>
            <BookOpen className="h-9 w-9 shrink-0 opacity-35" />
          </div>
        )}
        {details?.badge && (
          <span className="absolute bottom-3 left-3 rounded bg-card px-2 py-1 text-xs font-semibold text-primary shadow-sm">
            {details.badge}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col px-2 pb-3">
        <CourseSponsor details={details} />
        <h3 className={`mb-2 mt-3 font-bold leading-snug group-hover:text-primary ${onEdit ? "font-serif text-base" : "text-lg"}`}>
          {course.title}
        </h3>
        <p className="mb-5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {details?.skills ? (
            <>
              <b className="font-medium text-foreground">Skills you'll gain: </b>
              {details.skills}
            </>
          ) : (
            course.description
          )}
        </p>
        <div className="mt-auto space-y-3">
          <p className="text-xs text-muted-foreground">
            {[details?.level, "Self-paced course", details?.duration].filter(Boolean).join(" · ")}
          </p>
          <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-semibold text-primary">
            <span>
              {(course.price ?? 0) > 0
                ? `₱${Number(course.price).toLocaleString()}`
                : "Free to learn"}
            </span>
            <ArrowUpRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </>
  );

  if (onEdit) {
    return (
      <article className={cardClass}>
        {content}
        <button type="button" onClick={onEdit} aria-label={`Edit course: ${course.title}`} className="absolute inset-0 z-10 cursor-pointer rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" />
      </article>
    );
  }

  return (
    <Link
      to="/courses/$subjectId/$courseId"
      params={{ subjectId: course.subject_id, courseId: course.id }}
      search={{ s: undefined, q: undefined, paid: undefined }}
      className={cardClass}
    >
      {content}
    </Link>
  );
}
