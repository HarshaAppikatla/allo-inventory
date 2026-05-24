import { PrismaClient, Prisma, UserRole } from '@prisma/client';
import { hashPassword } from '../lib/auth';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // -------------------------------------------------------------------------
  // Users (ADMIN, SERVICE_PROVIDER, USER)
  // -------------------------------------------------------------------------
  const adminPassword = await hashPassword('admin123');
  const opsPassword = await hashPassword('ops123');
  const userPassword = await hashPassword('user123');

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@allohealth.com' },
      update: {
        password: adminPassword,
        name: 'System Admin',
        role: UserRole.ADMIN,
      },
      create: {
        email: 'admin@allohealth.com',
        password: adminPassword,
        name: 'System Admin',
        role: UserRole.ADMIN,
      },
    }),
    prisma.user.upsert({
      where: { email: 'ops@allohealth.com' },
      update: {
        password: opsPassword,
        name: 'Operations Operator',
        role: UserRole.SERVICE_PROVIDER,
      },
      create: {
        email: 'ops@allohealth.com',
        password: opsPassword,
        name: 'Operations Operator',
        role: UserRole.SERVICE_PROVIDER,
      },
    }),
    prisma.user.upsert({
      where: { email: 'user@allohealth.com' },
      update: {
        password: userPassword,
        name: 'John Customer',
        role: UserRole.USER,
      },
      create: {
        email: 'user@allohealth.com',
        password: userPassword,
        name: 'John Customer',
        role: UserRole.USER,
      },
    }),
  ]);

  console.log(`✅ Created ${users.length} authenticated users`);

  // -------------------------------------------------------------------------
  // Warehouses
  // -------------------------------------------------------------------------
  const warehouses = await Promise.all([
    prisma.warehouse.upsert({
      where: { id: 'wh_mumbai' },
      update: {},
      create: {
        id: 'wh_mumbai',
        name: 'Mumbai Central',
        location: 'Mumbai, Maharashtra',
      },
    }),
    prisma.warehouse.upsert({
      where: { id: 'wh_delhi' },
      update: {},
      create: {
        id: 'wh_delhi',
        name: 'Delhi NCR',
        location: 'Gurugram, Haryana',
      },
    }),
    prisma.warehouse.upsert({
      where: { id: 'wh_bangalore' },
      update: {},
      create: {
        id: 'wh_bangalore',
        name: 'Bangalore South',
        location: 'Bengaluru, Karnataka',
      },
    }),
  ]);

  console.log(`✅ Created ${warehouses.length} warehouses`);

  // -------------------------------------------------------------------------
  // Products
  // -------------------------------------------------------------------------
  const products = await Promise.all([
    prisma.product.upsert({
      where: { sku: 'ALLO-WM-PRO-001' },
      update: {
        isActive: true,
        archivedAt: null,
      },
      create: {
        id: 'prod_wm_pro',
        name: 'AlloSleep Pro Weighted Mattress',
        sku: 'ALLO-WM-PRO-001',
        description:
          'Our flagship 8-inch memory foam mattress with adaptive pressure relief and temperature regulation. Perfect for a restorative sleep.',
        imageUrl:
          'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=400&fit=crop',
        price: new Prisma.Decimal('24999.00'),
        isActive: true,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'ALLO-PIL-002' },
      update: {
        isActive: true,
        archivedAt: null,
      },
      create: {
        id: 'prod_pillow',
        name: 'ErgoCloud Adjustable Pillow',
        sku: 'ALLO-PIL-002',
        description:
          'Fully adjustable loft pillow with a blend of shredded memory foam and microfiber. Comes with two firmness inserts.',
        imageUrl:
          'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&h=400&fit=crop',
        price: new Prisma.Decimal('3499.00'),
        isActive: true,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'ALLO-TOP-003' },
      update: {
        isActive: true,
        archivedAt: null,
      },
      create: {
        id: 'prod_topper',
        name: 'CoolGel Mattress Topper',
        sku: 'ALLO-TOP-003',
        description:
          '3-inch gel-infused memory foam topper that adds a cloud-like softness to any existing mattress. Machine-washable cover.',
        imageUrl:
          'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&h=400&fit=crop',
        price: new Prisma.Decimal('8999.00'),
        isActive: true,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'ALLO-BF-004' },
      update: {
        isActive: true,
        archivedAt: null,
      },
      create: {
        id: 'prod_bedframe',
        name: 'Aria Solid Wood Bed Frame',
        sku: 'ALLO-BF-004',
        description:
          'Handcrafted solid sheesham wood bed frame with slatted support and a classic mid-century design. Available in Queen and King.',
        imageUrl:
          'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=600&h=400&fit=crop',
        price: new Prisma.Decimal('42500.00'),
        isActive: true,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'ALLO-BK-005' },
      update: {
        isActive: true,
        archivedAt: null,
      },
      create: {
        id: 'prod_blanket',
        name: 'SilkWeave Weighted Blanket',
        sku: 'ALLO-BK-005',
        description:
          'Premium 7kg weighted blanket with micro-glass bead filling and a breathable cotton cover. Reduces anxiety and improves sleep quality.',
        imageUrl:
          'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=600&h=400&fit=crop',
        price: new Prisma.Decimal('6799.00'),
        isActive: true,
      },
    }),
  ]);

  console.log(`✅ Created ${products.length} products`);

  // -------------------------------------------------------------------------
  // Inventory Stocks
  // -------------------------------------------------------------------------
  const stockData = [
    // Mumbai
    { productId: 'prod_wm_pro', warehouseId: 'wh_mumbai', totalQuantity: 25 },
    { productId: 'prod_pillow', warehouseId: 'wh_mumbai', totalQuantity: 80 },
    { productId: 'prod_topper', warehouseId: 'wh_mumbai', totalQuantity: 40 },
    { productId: 'prod_bedframe', warehouseId: 'wh_mumbai', totalQuantity: 2 },  // Low stock - good for demo
    { productId: 'prod_blanket', warehouseId: 'wh_mumbai', totalQuantity: 55 },
    // Delhi
    { productId: 'prod_wm_pro', warehouseId: 'wh_delhi', totalQuantity: 15 },
    { productId: 'prod_pillow', warehouseId: 'wh_delhi', totalQuantity: 120 },
    { productId: 'prod_topper', warehouseId: 'wh_delhi', totalQuantity: 0 },    // Out of stock
    { productId: 'prod_bedframe', warehouseId: 'wh_delhi', totalQuantity: 1 },  // Critical stock - great for concurrency demo
    { productId: 'prod_blanket', warehouseId: 'wh_delhi', totalQuantity: 30 },
    // Bangalore
    { productId: 'prod_wm_pro', warehouseId: 'wh_bangalore', totalQuantity: 8 },
    { productId: 'prod_pillow', warehouseId: 'wh_bangalore', totalQuantity: 60 },
    { productId: 'prod_topper', warehouseId: 'wh_bangalore', totalQuantity: 20 },
    { productId: 'prod_bedframe', warehouseId: 'wh_bangalore', totalQuantity: 3 },
    { productId: 'prod_blanket', warehouseId: 'wh_bangalore', totalQuantity: 0 },  // Out of stock
  ];

  for (const stock of stockData) {
    await prisma.inventoryStock.upsert({
      where: {
        productId_warehouseId: {
          productId: stock.productId,
          warehouseId: stock.warehouseId,
        },
      },
      update: {
        totalQuantity: stock.totalQuantity,
        reservedQuantity: 0,  // reset reservations on re-seed
      },
      create: {
        productId: stock.productId,
        warehouseId: stock.warehouseId,
        totalQuantity: stock.totalQuantity,
        reservedQuantity: 0,
      },
    });
  }

  console.log(`✅ Created ${stockData.length} inventory stock records`);
  console.log('\n🎉 Seeding complete!');
  console.log('\n📊 Summary:');
  console.log(`   Warehouses: ${warehouses.length} (Mumbai, Delhi NCR, Bangalore South)`);
  console.log(`   Products: ${products.length} (mattress, pillow, topper, bed frame, blanket)`);
  console.log(`   Stock records: ${stockData.length}`);
  console.log('\n💡 Delhi NCR - Aria Bed Frame has only 1 unit — perfect for concurrency testing!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
