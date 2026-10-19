import { links } from '../router.js';
import { plural, timeAgo } from '../utils.js';
import AuthImage from './AuthImage.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icons.jsx';

/** One poll in the feed grid. The whole card is clickable through the title link. */
export default function PollCard({ poll, index = 0, canDelete = false, deleting = false, onDelete }) {
  const shown = poll.options.slice(0, 3);
  const extra = poll.options.length - shown.length;

  return (
    <article
      className="card card-hover group relative flex h-full animate-fade-up flex-col overflow-hidden"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      {poll.imageUrl && (
        <div className="aspect-video w-full overflow-hidden bg-raised">
          <AuthImage
            src={poll.imageUrl}
            alt={`Image for the poll: ${poll.question}`}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        {poll.creator && (
          <a href={links.user(poll.creator.id)} className="relative z-10 flex w-fit items-center gap-2 text-sm text-muted hover:text-ink">
            <Avatar user={poll.creator} size="xs" />
            <span className="max-w-[10rem] truncate font-semibold">{poll.creator.username}</span>
            <span aria-hidden="true">&middot;</span>
            <time dateTime={new Date(poll.createdAt).toISOString()}>{timeAgo(poll.createdAt)}</time>
          </a>
        )}

        <p className="chip w-fit">{poll.category}</p>

        <h2 className="font-display text-lg font-bold leading-snug sm:text-xl">
          <a href={links.poll(poll.id)} className="line-clamp-3 break-words after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-2xl">
            {poll.question}
          </a>
        </h2>

        <ul className="flex flex-wrap gap-1.5">
          {shown.map((o) => (
            <li key={o.id} className="chip max-w-full truncate">
              {o.label}
            </li>
          ))}
          {extra > 0 && <li className="chip">+{extra} more</li>}
        </ul>

        <div className="mt-auto flex items-center gap-4 pt-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="vote" className="h-4 w-4 text-brand" /> {plural(poll.totalVotes, 'vote')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="message" className="h-4 w-4 text-accent" /> {poll.commentCount}
          </span>
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete?.(poll)}
              disabled={deleting}
              className="btn-danger btn-sm relative z-10 ml-auto"
              aria-label={`Delete the poll: ${poll.question}`}
            >
              <Icon name="trash" className="h-3.5 w-3.5" /> {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
