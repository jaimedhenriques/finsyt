'use client';

import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { getTrialStatus } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';

export function UserButton() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
    );
  }

  if (!session?.user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/auth/signin">
          <Button variant="ghost" size="sm">
            Sign In
          </Button>
        </Link>
        <Link href="/auth/signup">
          <Button size="sm">
            Start Free Trial
          </Button>
        </Link>
      </div>
    );
  }

  const { user } = session;
  const initials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user.email?.[0]?.toUpperCase() || '?';

  const trialStatus = user.trialEndDate
    ? getTrialStatus(new Date(user.trialEndDate))
    : null;

  const planDisplay = () => {
    if (user.plan === 'pro') return { label: 'Pro', color: 'text-primary' };
    if (user.plan === 'enterprise') return { label: 'Enterprise', color: 'text-purple-500' };
    if (user.plan === 'free_trial' && trialStatus) {
      if (trialStatus.isActive) {
        return {
          label: `Trial: ${trialStatus.daysRemaining} days left`,
          color: trialStatus.daysRemaining <= 3 ? 'text-orange-500' : 'text-green-500',
        };
      }
      return { label: 'Trial Expired', color: 'text-destructive' };
    }
    return { label: 'Free', color: 'text-muted-foreground' };
  };

  const plan = planDisplay();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.image || undefined} alt={user.name || 'User'} />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
            <p className={`text-xs font-medium ${plan.color}`}>
              {plan.label}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Trial status banner */}
        {user.plan === 'free_trial' && trialStatus && (
          <>
            <div className="px-2 py-2">
              {trialStatus.isActive ? (
                <div className="rounded-md bg-primary/10 p-2">
                  <p className="text-xs font-medium text-primary">
                    Free Trial Active
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {trialStatus.daysRemaining} days remaining
                  </p>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-primary/20">
                    <div
                      className="h-1.5 rounded-full bg-primary transition-all"
                      style={{ width: `${(trialStatus.daysRemaining / 15) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-md bg-destructive/10 p-2">
                  <p className="text-xs font-medium text-destructive">
                    Trial Expired
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Upgrade to continue using Finsyt
                  </p>
                </div>
              )}
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem asChild>
          <Link href="/dashboard" className="cursor-pointer">
            <svg
              className="mr-2 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/profile" className="cursor-pointer">
            <svg
              className="mr-2 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <svg
              className="mr-2 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        {/* Upgrade button for trial/free users */}
        {(user.plan === 'free_trial' || user.plan === 'free') && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/pricing" className="cursor-pointer">
                <svg
                  className="mr-2 h-4 w-4 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span className="text-primary font-medium">Upgrade Plan</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={() => signOut({ callbackUrl: '/' })}
        >
          <svg
            className="mr-2 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
