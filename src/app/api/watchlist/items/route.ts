import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { watchlistId, symbol, name, notes } = body;

    if (!watchlistId || !symbol) {
      return NextResponse.json(
        { error: 'Watchlist ID and symbol are required' },
        { status: 400 }
      );
    }

    // Verify watchlist ownership
    const watchlist = await db.watchlist.findUnique({
      where: { id: watchlistId, userId: session.user.id },
    });

    if (!watchlist) {
      return NextResponse.json(
        { error: 'Watchlist not found' },
        { status: 404 }
      );
    }

    // Check if already exists
    const existing = await db.watchlistItem.findUnique({
      where: {
        watchlistId_symbol: { watchlistId, symbol: symbol.toUpperCase() },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Symbol already in watchlist' },
        { status: 409 }
      );
    }

    const item = await db.watchlistItem.create({
      data: {
        watchlistId,
        symbol: symbol.toUpperCase(),
        name,
        notes,
      },
    });

    // Update watchlist timestamp
    await db.watchlist.update({
      where: { id: watchlistId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('Watchlist item POST error:', error);
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
    const watchlistId = searchParams.get('watchlistId');
    const symbol = searchParams.get('symbol');

    // Delete by ID or by watchlistId + symbol
    let item;

    if (id) {
      item = await db.watchlistItem.findUnique({
        where: { id },
        include: { watchlist: true },
      });
    } else if (watchlistId && symbol) {
      item = await db.watchlistItem.findUnique({
        where: {
          watchlistId_symbol: { watchlistId, symbol: symbol.toUpperCase() },
        },
        include: { watchlist: true },
      });
    } else {
      return NextResponse.json(
        { error: 'ID or (watchlistId + symbol) required' },
        { status: 400 }
      );
    }

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Verify ownership
    if (item.watchlist.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await db.watchlistItem.delete({ where: { id: item.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Watchlist item DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
