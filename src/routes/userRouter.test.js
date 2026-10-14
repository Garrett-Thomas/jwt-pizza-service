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

test('delete user as non-admin is rejected', async () => {
    const res = await request(app).delete(`/api/user/${dinerUser.id}`).set('Authorization', `Bearer ${dinerToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'unauthorized' });
});

test('delete user as admin', async () => {
    const [user] = await registerUser(request(app));

    const res = await request(app).delete(`/api/user/${user.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'user deleted' });

    const loginRes = await request(app).put('/api/auth').send(user);
    expect(loginRes.status).toBe(404);
});

test('delete unknown user', async () => {
    const res = await request(app).delete('/api/user/999999999').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
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

test('list users filters by name', async () => {
    const unique = randomName();
    const [matching] = await registerNamedUser(`${unique}-match`);
    await registerNamedUser(randomName());

    const res = await request(app).get(`/api/user?name=*${unique}*`).set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([{ id: matching.id, name: matching.name, email: matching.email, roles: [{ role: 'diner' }] }]);
    expect(res.body.more).toBe(false);
});

test('list users paginates', async () => {
    const unique = randomName();
    for (let i = 0; i < 3; i++) {
        await registerNamedUser(`${unique}-${i}`);
    }
    const listPage = (page, limit) => request(app).get(`/api/user?page=${page}&limit=${limit}&name=*${unique}*`).set('Authorization', `Bearer ${adminToken}`);

    const first = await listPage(0, 2);
    expect(first.body.users).toHaveLength(2);
    expect(first.body.more).toBe(true);

    const second = await listPage(1, 2);
    expect(second.body.users).toHaveLength(1);
    expect(second.body.more).toBe(false);
    expect(second.body.users[0].id).not.toBe(first.body.users[0].id);
    expect(second.body.users[0].id).not.toBe(first.body.users[1].id);
});

test('list users as non-admin is rejected', async () => {
    const [user, userToken] = await registerUser(request(app));
    const listUsersRes = await request(app)
        .get('/api/user')
        .set('Authorization', 'Bearer ' + userToken);
    expect(listUsersRes.status).toBe(403);
    expect(listUsersRes.body).toEqual({ message: 'unauthorized' });
});

async function registerNamedUser(name) {
    const res = await request(app).post('/api/auth').send({ name, email: `${randomName()}@test.com`, password: 'a' });
    return [res.body.user, res.body.token];
}

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