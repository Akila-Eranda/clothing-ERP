import { Module } from '@nestjs/common';
import {
  Controller, Post, Delete, Get, Param, Body,
  UploadedFile, UseInterceptors, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import * as path from 'path';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import * as mime from 'mime-types';
import { memoryStorage } from 'multer';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

@Injectable()
export class FilesService {
  private readonly uploadDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const configured = this.config.get<string>('storage.local.uploadDir');
    this.uploadDir = path.resolve(configured || process.env.UPLOAD_DIR || 'uploads');
  }

  async uploadFile(
    tenantId: string,
    userId: string,
    file: Express.Multer.File,
    folder = 'general',
  ) {
    if (!file) throw new BadRequestException('No file uploaded');

    const safeFolder = (folder || 'general').replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
    const ext = mime.extension(file.mimetype) || path.extname(file.originalname).slice(1) || 'bin';
    const filename = `${uuidv4()}.${ext}`;
    const dir = path.join(this.uploadDir, tenantId, safeFolder);
    const filepath = path.join(dir, filename);

    await fs.mkdir(dir, { recursive: true });

    const data = file.buffer ?? (file.path ? await fs.readFile(file.path) : null);
    if (!data) throw new BadRequestException('Upload failed — empty file payload');
    await fs.writeFile(filepath, data);

    const url = `/uploads/${tenantId}/${safeFolder}/${filename}`;
    const size = file.size;

    const record = await this.prisma.fileUpload.create({
      data: {
        tenantId,
        uploadedBy: userId,
        originalName: file.originalname,
        filename,
        mimeType: file.mimetype,
        size,
        url,
        folder: safeFolder,
        storageProvider: 'local',
      },
    });

    return record;
  }

  async findAll(tenantId: string, folder?: string) {
    return this.prisma.fileUpload.findMany({
      where: { tenantId, ...(folder && { folder }) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(id: string, tenantId: string) {
    const file = await this.prisma.fileUpload.findFirst({ where: { id, tenantId } });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  async remove(id: string, tenantId: string) {
    const file = await this.findOne(id, tenantId);
    const filepath = path.join(this.uploadDir, tenantId, file.folder ?? '', file.filename);
    try { await fs.unlink(filepath); } catch {}
    return this.prisma.fileUpload.delete({ where: { id } });
  }
}

@ApiTags('Files')
@ApiBearerAuth('access-token')
@Controller({ path: 'files', version: '1' })
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a file' })
  upload(
    @CurrentUser() user: IAuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    return this.filesService.uploadFile(user.tenantId, user.id, file, folder);
  }

  @Get()
  @ApiOperation({ summary: 'List uploaded files' })
  findAll(@CurrentUser() user: IAuthUser, @Param('folder') folder?: string) {
    return this.filesService.findAll(user.tenantId, folder);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get file info' })
  findOne(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.filesService.findOne(id, user.tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete file' })
  remove(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.filesService.remove(id, user.tenantId);
  }
}

@Module({
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
