const request = require('supertest');
const app = require('../service');
const { createAdminUser, loginUser, registerDinerUser, randomName } = require('../test_utils/testUtils');

let adminToken;
let dinerToken;

beforeAll(async () => {
    const admin = await createAdminUser();
    adminToken = await loginUser(app, admin);

    ({ token: dinerToken } = await registerDinerUser(app));
});

test('get menu', async () => {
    const res = await request(app).get('/api/order/menu');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
});

test('add menu item as admin', async () => {
    const item = { title: randomName(), description: 'test item', image: 'pizza.png', price: 0.01 };
    const res = await request(app).put('/api/order/menu').set('Authorization', `Bearer ${adminToken}`).send(item);

    expect(res.status).toBe(200);
    expect(res.body.some((m) => m.title === item.title)).toBe(true);
});

test('get orders', async () => {
    const res = await request(app).get('/api/order').set('Authorization', `Bearer ${dinerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('orders');
});

test('create order', async () => {
    const item = { title: randomName(), description: 'test item', image: 'pizza.png', price: 0.01 };
    const menuRes = await request(app).put('/api/order/menu').set('Authorization', `Bearer ${adminToken}`).send(item);
    const menuItem = menuRes.body.find((m) => m.title === item.title);

    jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ reportUrl: 'http://report.url', jwt: 'factory.jwt.token' }),
    });

    const order = { franchiseId: 1, storeId: 1, items: [{ menuId: menuItem.id, description: item.title, price: item.price }] };
    const res = await request(app).post('/api/order').set('Authorization', `Bearer ${dinerToken}`).send(order);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('jwt', 'factory.jwt.token');

    global.fetch.mockRestore();
});
