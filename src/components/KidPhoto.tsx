import { useSignedProfilePicture } from '@/hooks/useSignedProfilePicture';

/**
 * The same thing for a plain <img>. ApplyTemplateDialog renders kid photos as a
 * 24px <img> inside a label rather than through an Avatar, so KidAvatarImage is
 * not a drop-in there.
 *
 * It exists as a component rather than a call to the hook because the render
 * site is inside a .map() over kids, and a hook cannot be called per iteration.
 * One component instance per kid gives each its own signing state and its own
 * refresh timer, which is what you want anyway.
 *
 * `alt` is required rather than optional: a child's photograph is content, not
 * decoration, and the one call site already has the name to hand.
 */
export function KidPhoto({
  src,
  alt,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & { alt: string }) {
  const signed = useSignedProfilePicture(typeof src === 'string' ? src : undefined);
  return <img {...props} alt={alt} src={signed} />;
}
