'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';

import { Button } from './ui/button';

export function LogoutButton({ className }: { readonly className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <Button
      className={className}
      loading={loading}
      onClick={logout}
      variant="ghost"
    >
      <LogOut aria-hidden="true" className="h-4 w-4" />
      {loading ? 'Saindo…' : 'Sair'}
    </Button>
  );
}
