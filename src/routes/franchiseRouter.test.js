const request = require('supertest');
const app = require('../service');
const { createAdminUser, loginUser } = require('../test_utils/testUtils');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let userToken;
beforeAll(async () => {
    testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
    const registerRes = await request(app).post('/api/auth').send(testUser);
    userToken = registerRes.body.token;
});

test('get franchise', async () => {
    const res = await request(app).get('/api/franchise?page=0&limit=10&name=*');

    expect(res.body).toHaveProperty("franchises");
});

/*
  {
    method: 'POST',
    path: '/api/franchise',
    requiresAuth: true,
    description: 'Create a new franchise',
    example: `curl -X POST localhost:3000/api/franchise -H 'Content-Type: application/json' -H 'Authorization: Bearer tttttt' -d '{"name": "pizzaPocket", "admins": [{"email": "f@jwt.com"}]}'`,
    response: { name: 'pizzaPocket', admins: [{ email: 'f@jwt.com', id: 4, name: 'pizza franchisee' }], id: 1 },
  },
*/

test('create franchise', async () => {
    const admin = await createAdminUser();
    const adminToken = await loginUser(app, admin);

    const franchise = { "name": "testFranchise", "admins": [{ "email": testUser.email }] };
    const res = await request(app).post('/api/franchise').set('Authorization', `Bearer ${adminToken}`).send(franchise);

    expect(res.body).toHaveProperty('name');
    expect(res.body.name).toBe('testFranchise');
});