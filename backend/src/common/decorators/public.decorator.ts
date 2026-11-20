import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Route is reachable without authentication (guests). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const OPTIONAL_AUTH_KEY = 'optionalAuth';
/** Route is public but, if a valid session cookie is present, req.user is populated. */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);

export const ALLOW_PASSWORD_CHANGE_PENDING_KEY = 'allowPasswordChangePending';
/** Route stays usable while the account must still replace a temporary password (ACC-07a, ACC-13). */
export const AllowPasswordChangePending = () => SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING_KEY, true);
