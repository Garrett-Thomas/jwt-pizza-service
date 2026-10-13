const request = require('supertest');
const app = require('../service');
const { createAdminUser, loginUser, registerDinerUser, randomName } = require('../test_utils/testUtils');

let adminToken;
let admin;
let dinerUser, dinerToken;
beforeAll(async () => {
    admin = await createAdminUser();
    adminToken = await loginUser(app, admin);

    ({ user: dinerUser, token: dinerToken } = await registerDinerUser(app));
});


test('get oneself', async () => {

    const res = await request(app).get("/api/user/me").set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.email).toBe(admin.email);
    expect(res.body.id).toBe(admin.id);
});

test('update self', async () => {
    const res = await request(app)
        .put(`/api/user/${dinerUser.id}`)
        .set('Authorization', `Bearer ${dinerToken}`)
        .send({ name: 'updated name', email: dinerUser.email, password: 'toomanysecrets' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('updated name');
});

test('update other as non-admin is rejected', async () => {
    const res = await request(app)
        .put(`/api/user/${admin.id}`)
        .set('Authorization', `Bearer ${dinerToken}`)
        .send({ name: 'hacked', email: admin.email, password: 'toomanysecrets' });

    expect(res.status).toBe(403);
});

test('delete user', async () => {
    const res = await request(app).delete(`/api/user/${dinerUser.id}`).set('Authorization', `Bearer ${dinerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'not implemented' });
});

test('list users as admin', async () => {
    const res = await request(app).get('/api/user').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
});

test('list users returns user details without passwords', async () => {
    const res = await request(app).get('/api/user').set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.users.length).toBeGreaterThan(0);
    for (const user of res.body.users) {
        expect(user).toEqual({
            id: expect.any(Number),
            name: expect.any(String),
            email: expect.any(String),
            roles: expect.any(Array),
        });
    }
});

test('list users unauthorized', async () => {
    const listUsersRes = await request(app).get('/api/user');
    expect(listUsersRes.status).toBe(401);
});

test('list users', async () => {
    const [user, userToken] = await registerUser(request(app));
    const listUsersRes = await request(app)
        .get('/api/user')
        .set('Authorization', 'Bearer ' + userToken);
    expect(listUsersRes.status).toBe(200);
});

async function registerUser(service) {
    const testUser = {
        name: 'pizza diner',
        email: `${randomName()}@test.com`,
        password: 'a',
    };
    const registerRes = await service.post('/api/auth').send(testUser);
    registerRes.body.user.password = testUser.password;

    return [registerRes.body.user, registerRes.body.token];
}