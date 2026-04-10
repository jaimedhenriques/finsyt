import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const watchlistId = searchParams.get('id');

    if (watchlistId) {
      const watchlist = await db.watchlist.findUnique({
        where: { id: watchlistId, userId: session.user.id },
        include: {
          items: {
            orderBy: { addedAt: 'desc' },
          },
        },
      });

      if (!watchlist) {
        return NextResponse.json(
          { error: 'Watchlist not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(watchlist);
    }

    const watchlists = await db.watchlist.findMany({
      where: { userId: session.user.id },
      include: {
        _count: { select: { items: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json(watchlists);
  } catch (error) {
    console.error('Watchlist GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, isDefault = false } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // If this is set as default, unset other defaults
    if (isDefault) {
      await db.watchlist.updateMany({
        where: { userId: session.user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const watchlist = await db.watchlist.create({
      data: {
        userId: session.user.id,
        name,
        isDefault,
      },
    });

    return NextResponse.json(watchlist, { status: 201 });
  } catch (error) {
    console.error('Watchlist POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, isDefault } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Watchlist ID is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    const existing = await db.watchlist.findUnique({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Watchlist not found' },
        { status: 404 }
      );
    }

    // If setting as default, unset others
    if (isDefault) {
      await db.watchlist.updateMany({
        where: { userId: session.user.id, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    const watchlist = await db.watchlist.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        isDefault: isDefault ?? existing.isDefault,
      },
    });

    return NextResponse.json(watchlist);
  } catch (error) {
    console.error('Watchlist PUT error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Watchlist ID is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    const existing = await db.watchlist.findUnique({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Watchlist not found' },
        { status: 404 }
      );
    }

    await db.watchlist.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Watchlist DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
