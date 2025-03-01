import { 
    Repository, 
    DeepPartial, 
    FindOneOptions, 
    FindManyOptions 
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { BaseEntity } from '../models/base.entity';

export abstract class BaseRepository<T extends BaseEntity> {
    constructor(protected repository: Repository<T>) {}

    async create(data: DeepPartial<T>): Promise<T> {
        const entity = this.repository.create(data);
        return this.repository.save(entity);
    }

    async findById(id: string, options?: FindOneOptions<T>): Promise<T | null> {
        return this.repository.findOne({ where: { id } as any, ...options });
    }

    async findOne(options: FindOneOptions<T>): Promise<T | null> {
        return this.repository.findOne(options);
    }

    async findMany(options?: FindManyOptions<T>): Promise<T[]> {
        return this.repository.find(options);
    }

    async update(id: string, data: QueryDeepPartialEntity<T>): Promise<T | null> {
        await this.repository.update(id, data);
        return this.findById(id);
    }

    async delete(id: string): Promise<boolean> {
        const result = await this.repository.delete(id);
        return result.affected ? result.affected > 0 : false;
    }
}