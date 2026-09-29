const request = require('supertest');
const app = require('../service');
const { createAdminUser, loginUser, registerDinerUser, randomName } = require('../test_utils/testUtils');

let adminToken;
let franchiseeUser, franchiseeToken;

beforeAll(async () => {
    const admin = await createAdminUser();
    adminToken = await loginUser(app, admin);

    ({ user: franchiseeUser, token: franchiseeToken } = await registerDinerUser(app));
});

test('get franchise', async () => {
    const res = await request(app).get('/api/franchise?page=0&limit=10&name=*');

    expect(res.body).toHaveProperty('franchises');
});

test('create franchise as non-admin is rejected', async () => {
    const franchise = { name: 'testFranchise-' + randomName(), admins: [{ email: franchiseeUser.email }] };
    const res = await request(app).post('/api/franchise').set('Authorization', `Bearer ${franchiseeToken}`).send(franchise);

    expect(res.status).toBe(403);
});

test('create franchise, get user franchises, create store, delete store, delete franchise', async () => {
    const franchise = { name: 'testFranchise-' + randomName(), admins: [{ email: franchiseeUser.email }] };
    const createRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${adminToken}`).send(franchise);
    expect(createRes.body).toHaveProperty('id');

    const userFranchisesRes = await request(app).get(`/api/franchise/${franchiseeUser.id}`).set('Authorization', `Bearer ${franchiseeToken}`);
    expect(userFranchisesRes.body.some((f) => f.id === createRes.body.id)).toBe(true);

    const storeRes = await request(app)
        .post(`/api/franchise/${createRes.body.id}/store`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'SLC' });
    expect(storeRes.body).toMatchObject({ franchiseId: createRes.body.id, name: 'SLC' });

    const deleteStoreRes = await request(app)
        .delete(`/api/franchise/${createRes.body.id}/store/${storeRes.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteStoreRes.body).toEqual({ message: 'store deleted' });

    const deleteFranchiseRes = await request(app).delete(`/api/franchise/${createRes.body.id}`);
    expect(deleteFranchiseRes.body).toEqual({ message: 'franchise deleted' });
});
