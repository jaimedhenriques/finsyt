import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { AgentType, AgentStatus } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('id');

    if (agentId) {
      const agent = await db.agent.findUnique({
        where: { id: agentId, userId: session.user.id },
        include: {
          runs: {
            orderBy: { startedAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }

      return NextResponse.json(agent);
    }

    const agents = await db.agent.findMany({
      where: { userId: session.user.id },
      include: {
        _count: { select: { runs: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json(agents);
  } catch (error) {
    console.error('Agents GET error:', error);
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
    const { name, description, type, config, schedule } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: 'Name and type are required' },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes: AgentType[] = [
      'EARNINGS_MONITOR',
      'NEWS_DIGEST',
      'FILING_ALERT',
      'PRICE_ALERT',
      'CUSTOM_RESEARCH',
    ];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid agent type' },
        { status: 400 }
      );
    }

    const agent = await db.agent.create({
      data: {
        userId: session.user.id,
        name,
        description,
        type,
        config: config || {},
        schedule,
        status: 'IDLE',
      },
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (error) {
    console.error('Agents POST error:', error);
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
    const { id, name, description, config, schedule, status } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Agent ID is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    const existing = await db.agent.findUnique({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Validate status if provided
    if (status) {
      const validStatuses: AgentStatus[] = ['IDLE', 'RUNNING', 'PAUSED', 'ERROR'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: 'Invalid status' },
          { status: 400 }
        );
      }
    }

    const agent = await db.agent.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        description: description ?? existing.description,
        config: config ?? existing.config,
        schedule: schedule ?? existing.schedule,
        status: status ?? existing.status,
      },
    });

    return NextResponse.json(agent);
  } catch (error) {
    console.error('Agents PUT error:', error);
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
        { error: 'Agent ID is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    const existing = await db.agent.findUnique({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    await db.agent.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Agents DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
