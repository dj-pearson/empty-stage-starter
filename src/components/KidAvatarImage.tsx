import { AvatarImage } from '@/components/ui/avatar';
import { useSignedProfilePicture } from '@/hooks/useSignedProfilePicture';

type AvatarImageProps = React.ComponentPropsWithoutRef<typeof AvatarImage>;

/**
 * US-634: drop-in for <AvatarImage src={kid.profile_picture_url} />.
 *
 * Renders the same element; the only difference is that the src is a signed
 * URL once one has been minted, falling back to whatever was passed in. Kept
 * as a component rather than asking each call site to use the hook so the
 * render sites stay one-liners and there is a single place to change when
 * Release N+1 makes the bucket private.
 */
export function KidAvatarImage({ src, ...props }: AvatarImageProps) {
  const signed = useSignedProfilePicture(typeof src === 'string' ? src : undefined);
  return <AvatarImage {...props} src={signed} />;
}
