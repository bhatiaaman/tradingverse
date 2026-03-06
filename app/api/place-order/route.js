import { NextResponse } from 'next/server';
import { KiteConnect } from 'kiteconnect';
import { getKiteCredentials } from '@/app/lib/kite-credentials';
import { orderLimiter, checkLimit } from '@/app/lib/rate-limit';

export async function POST(request) {
  const rl = await checkLimit(orderLimiter, request);
  if (rl.limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { apiKey, accessToken } = await getKiteCredentials();

  if (!apiKey || !accessToken) {
    return NextResponse.json(
      { error: 'Kite API not configured. Please set up your API credentials.' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const {
      tradingsymbol,
      exchange = 'NSE',
      transaction_type,
      quantity,
      product = 'CNC',
      order_type = 'MARKET',
      price = null,
      trigger_price = null,
      validity = 'DAY',
      variety = 'regular',
      disclosed_quantity = 0,
      tag = '',
    } = body;

    if (!tradingsymbol) {
      return NextResponse.json({ error: 'Trading symbol is required' }, { status: 400 });
    }
    if (!transaction_type || !['BUY', 'SELL'].includes(transaction_type)) {
      return NextResponse.json({ error: 'Transaction type must be BUY or SELL' }, { status: 400 });
    }
    if (!quantity || quantity <= 0) {
      return NextResponse.json({ error: 'Quantity must be a positive number' }, { status: 400 });
    }

    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 });
    }

    const orderParams = {
      tradingsymbol: tradingsymbol.toUpperCase(),
      exchange: exchange.toUpperCase(),
      transaction_type: transaction_type.toUpperCase(),
      quantity: parsedQty,
      product: product.toUpperCase(),
      order_type: order_type.toUpperCase(),
      validity,
      variety,
    };

    if (order_type === 'LIMIT' && price) {
      orderParams.price = parseFloat(price);
    }
    if (['SL', 'SL-M'].includes(order_type) && trigger_price) {
      const triggerNum = Number(trigger_price);
      orderParams.trigger_price = triggerNum;
      let priceNum = null;
      if (price !== null && price !== undefined) {
        priceNum = Number(price);
        orderParams.price = priceNum;
        if (transaction_type === 'BUY' && priceNum < triggerNum) {
          return NextResponse.json({ error: 'For SL/SL-M BUY orders, price must be equal to or higher than trigger price.' }, { status: 400 });
        }
        if (transaction_type === 'SELL' && priceNum > triggerNum) {
          return NextResponse.json({ error: 'For SL/SL-M SELL orders, price must be equal to or lower than trigger price.' }, { status: 400 });
        }
      }
    }
    if (disclosed_quantity > 0) {
      const parsedDQ = parseInt(disclosed_quantity, 10);
      if (!isNaN(parsedDQ) && parsedDQ > 0) orderParams.disclosed_quantity = parsedDQ;
    }
    if (tag) {
      orderParams.tag = tag.replace(/[^a-zA-Z0-9 \-_.]/g, '').slice(0, 20);
    }

    const orderResponse = await kite.placeOrder(variety, orderParams);

    return NextResponse.json({
      success: true,
      order_id: orderResponse.order_id,
      message: `Order placed successfully. Order ID: ${orderResponse.order_id}`,
      details: orderParams,
    });

  } catch (error) {
    console.error('Order placement error:', error);

    let errorMessage = error.message || 'Failed to place order';
    let statusCode = 500;

    if (error.message?.includes('Token')) {
      errorMessage = 'Session expired. Please re-authenticate with Kite.';
      statusCode = 401;
    } else if (error.message?.includes('margin')) {
      errorMessage = 'Insufficient margin for this order.';
      statusCode = 400;
    } else if (error.message?.includes('quantity')) {
      errorMessage = 'Invalid quantity. Please check lot size requirements.';
      statusCode = 400;
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
}

export async function GET(request) {
  const { apiKey, accessToken } = await getKiteCredentials();

  if (!apiKey || !accessToken) {
    return NextResponse.json({ error: 'Kite API not configured' }, { status: 400 });
  }

  try {
    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'orders';

    let data;
    if (type === 'positions') {
      data = await kite.getPositions();
    } else if (type === 'holdings') {
      data = await kite.getHoldings();
    } else {
      data = await kite.getOrders();
    }

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('Error fetching order data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}