// Mock for axios
const axiosMock = {
    defaults: {
        baseURL: "http://localhost:3030/api",
    },
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: { response: {} } }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
};

export default axiosMock;
