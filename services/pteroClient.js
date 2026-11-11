const axios = require('axios');
const FormData = require('form-data');

class PteroApiClient {
  /**
   * @param {string} panelUrl
   * @param {string} apiKey
   */
  constructor(panelUrl, apiKey) {
    this.baseUrl = String(panelUrl).trim().replace(/\/+$/, '');
    this.apiKey = String(apiKey).trim();

    this.http = axios.create({
      baseURL: `${this.baseUrl}/api/client`,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 25000,
    });
  }

  formatError(err) {
    if (!err) return 'Terjadi kesalahan internal.';
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      if (data && Array.isArray(data.errors) && data.errors.length > 0) {
        const details = data.errors.map((e) => e.detail || e.code).join(', ');
        return `Error ${status}: ${details}`;
      }
      if (data && data.message) {
        return `Error ${status}: ${data.message}`;
      }
      return `Error HTTP ${status} dari panel.`;
    }
    if (err.code === 'ECONNABORTED') {
      return 'Koneksi ke panel timeout. Periksa status panel.';
    }
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      return 'Gagal menghubungi panel. Periksa alamat URL panel.';
    }
    return err.message || 'Gagal menghubungi server.';
  }

  async getAccount() {
    try {
      const res = await this.http.get('/account');
      return res.data.attributes;
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async listServers(page = 1) {
    try {
      const res = await this.http.get(`?page=${page}&per_page=10`);
      const servers = (res.data.data || []).map((item) => item.attributes);
      const pagination = res.data.meta ? res.data.meta.pagination : { total: servers.length, current_page: 1, total_pages: 1 };
      return { servers, pagination };
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async getServer(identifier) {
    try {
      const res = await this.http.get(`/servers/${identifier}`);
      return res.data.attributes;
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async getServerResources(identifier) {
    try {
      const res = await this.http.get(`/servers/${identifier}/resources`);
      return res.data.attributes;
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async sendPowerAction(identifier, signal) {
    try {
      await this.http.post(`/servers/${identifier}/power`, { signal });
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async sendCommand(identifier, command) {
    try {
      await this.http.post(`/servers/${identifier}/command`, { command });
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async listFiles(identifier, directory = '/') {
    try {
      const cleanDir = directory.startsWith('/') ? directory : `/${directory}`;
      const res = await this.http.get(`/servers/${identifier}/files/list?directory=${encodeURIComponent(cleanDir)}`);
      return (res.data.data || []).map((item) => item.attributes);
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async getFileContents(identifier, filePath) {
    try {
      const res = await this.http.get(`/servers/${identifier}/files/contents?file=${encodeURIComponent(filePath)}`, {
        transformResponse: [(data) => data],
        responseType: 'text',
      });
      return res.data;
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async writeFileContents(identifier, filePath, content) {
    try {
      await this.http.post(
        `/servers/${identifier}/files/write?file=${encodeURIComponent(filePath)}`,
        content,
        {
          headers: {
            'Content-Type': 'text/plain',
          },
        }
      );
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async renameFile(identifier, rootDir, from, to) {
    try {
      await this.http.put(`/servers/${identifier}/files/rename`, {
        root: rootDir,
        files: [{ from, to }],
      });
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async deleteFiles(identifier, rootDir, files) {
    try {
      const fileList = Array.isArray(files) ? files : [files];
      await this.http.post(`/servers/${identifier}/files/delete`, {
        root: rootDir,
        files: fileList,
      });
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async createFolder(identifier, rootDir, name) {
    try {
      await this.http.post(`/servers/${identifier}/files/create-folder`, {
        root: rootDir,
        name,
      });
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async getDownloadUrl(identifier, filePath) {
    try {
      const res = await this.http.get(`/servers/${identifier}/files/download?file=${encodeURIComponent(filePath)}`);
      return res.data.attributes.url;
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async getUploadUrl(identifier) {
    try {
      const res = await this.http.get(`/servers/${identifier}/files/upload`);
      return res.data.attributes.url;
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async uploadFile(identifier, directory, filename, buffer) {
    try {
      const uploadUrl = await this.getUploadUrl(identifier);
      const cleanDir = directory.startsWith('/') ? directory : `/${directory}`;
      const targetUrl = `${uploadUrl}&directory=${encodeURIComponent(cleanDir)}`;

      const form = new FormData();
      form.append('files', buffer, { filename });

      await axios.post(targetUrl, form, {
        headers: form.getHeaders(),
        timeout: 45000,
      });
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async getStartup(identifier) {
    try {
      const res = await this.http.get(`/servers/${identifier}/startup`);
      const meta = res.data.meta || {};
      const variables = (res.data.data || []).map((v) => v.attributes);
      return {
        invocation: meta.startup_command || '',
        rawStartup: meta.raw_startup_command || '',
        dockerImages: meta.docker_images || {},
        variables,
      };
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async updateStartupVariable(identifier, key, value) {
    try {
      const res = await this.http.put(`/servers/${identifier}/startup/variable`, {
        key,
        value,
      });
      return res.data.attributes;
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }

  async getWebsocketCredentials(identifier) {
    try {
      const res = await this.http.get(`/servers/${identifier}/websocket`);
      return res.data.data;
    } catch (err) {
      throw new Error(this.formatError(err));
    }
  }
}

function createClient(panelUrl, apiKey) {
  return new PteroApiClient(panelUrl, apiKey);
}

module.exports = {
  PteroApiClient,
  createClient,
};
